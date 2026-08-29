const { AutoTokenizer, AutoModelForSequenceClassification, pipeline, env } = require('@huggingface/transformers');
const { splitBySentence } = require('./textChunker');

// Once models are pre-cached (e.g. baked into a deploy image), set
// ML_ALLOW_REMOTE_MODELS=false so a missing cache fails loudly instead of silently
// reaching out to the network - makes "no network calls at inference time" something
// the code enforces rather than just something that happens to be true.
if (process.env.ML_ALLOW_REMOTE_MODELS === 'false') {
  env.allowRemoteModels = false;
}

// bge-small-en-v1.5 produces 384-dimensional vectors; textbook_chunks.embedding is sized
// to match (see db/migrations/002_llm_pipeline.sql).
const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5';
const EMBEDDING_DIMENSIONS = 384;

// The "-small" variant calibrates noticeably better than "-xsmall" on paraphrased
// answers (tested: xsmall gave a correct paraphrase only 63% backward-entailment,
// small gave 100%) for modest extra compute - worth it for a grading task.
const NLI_MODEL = 'Xenova/nli-deberta-v3-small';

// Everything here runs locally via ONNX/CPU - no API key, no external account, no
// per-call cost, no network calls once the models are cached on disk. Loading a model
// is the expensive part (pulls the weights into memory on first use), so each one is
// built once and reused, not rebuilt per call.
let embedderPromise;
function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = pipeline('feature-extraction', EMBEDDING_MODEL);
  }
  return embedderPromise;
}

let nliPromise;
async function getNli() {
  if (!nliPromise) {
    nliPromise = (async () => {
      const tokenizer = await AutoTokenizer.from_pretrained(NLI_MODEL);
      const model = await AutoModelForSequenceClassification.from_pretrained(NLI_MODEL);
      const labelIndex = {};
      for (const [idx, name] of Object.entries(model.config.id2label)) labelIndex[name] = Number(idx);
      return { tokenizer, model, labelIndex };
    })();
  }
  return nliPromise;
}

// Embeds one or more strings in a single batch, returns embeddings in the same order.
async function embedTexts(texts) {
  const embedder = await getEmbedder();
  const output = await embedder(texts, { pooling: 'mean', normalize: true });
  return output.tolist();
}

async function embedText(text) {
  const [embedding] = await embedTexts([text]);
  return embedding;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both vectors are already normalized (pooling: mean, normalize: true), so dot product == cosine similarity
}

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / sum);
}

// NOTE: deliberately uses the low-level tokenizer+model API, not the high-level
// pipeline('text-classification', ...) wrapper - that wrapper was found (by testing) to
// return identical results across sequential calls with different sentence-pair inputs,
// a real bug in this library version for paired classification. Calling the model
// directly and reading logits avoids it.
async function nliProbs(premise, hypothesis) {
  const { tokenizer, model, labelIndex } = await getNli();
  const inputs = await tokenizer(premise, { text_pair: hypothesis, padding: true, truncation: true });
  const output = await model(inputs);
  const probs = softmax(Array.from(output.logits.data));
  return {
    entailment: probs[labelIndex.entailment],
    contradiction: probs[labelIndex.contradiction],
    neutral: probs[labelIndex.neutral],
  };
}

const GROUNDING_WEIGHT = 0.15; // secondary signal - a sanity check the answer is grounded
const CORRECTNESS_WEIGHT = 1 - GROUNDING_WEIGHT; // primary signal - correctness vs the teacher's reference answer
const COVERED_THRESHOLD = 0.5; // net (entailment - contradiction) above which a key point counts as "addressed", for feedback text only

// Scores a student's descriptive answer against the reference answer and (optionally)
// retrieved textbook context, entirely via local models - no generative reasoning, no
// free-form LLM feedback. Returns { marks, similarity_score, feedback }.
//
// The reference answer is decomposed into key points (one per sentence) and each is
// checked for entailment/contradiction against the student's answer independently, then
// averaged - this is what gives graduated partial credit instead of an all-or-nothing
// score. A single-sentence reference answer degrades gracefully to one key point.
//
// Per key point, entailment - contradiction is deliberately NOT clamped to [0,1] before
// averaging: a confidently contradicted point (net close to -1) must be able to drag the
// average below what a merely-omitted point (net close to 0) would - otherwise a wrong
// answer and an incomplete-but-not-wrong answer score identically. Only the final
// aggregate is clamped to [0, 1].
async function scoreAnswer({ referenceAnswer, contextText, studentAnswer, maximumMarks }) {
  const keyPoints = splitBySentence(referenceAnswer);

  const perPointScores = [];
  for (const keyPoint of keyPoints) {
    const probs = await nliProbs(studentAnswer, keyPoint); // premise=student's answer, hypothesis=key point
    perPointScores.push(probs.entailment - probs.contradiction);
  }
  const correctness = Math.max(0, perPointScores.reduce((a, b) => a + b, 0) / perPointScores.length);

  let final = correctness;
  if (contextText && contextText.trim().length > 0) {
    const [studentEmbedding, contextEmbedding] = await embedTexts([studentAnswer, contextText]);
    const grounding = cosineSimilarity(studentEmbedding, contextEmbedding);
    final = CORRECTNESS_WEIGHT * correctness + GROUNDING_WEIGHT * grounding;
  }
  final = Math.max(0, Math.min(1, final));

  const coveredCount = perPointScores.filter((s) => s > COVERED_THRESHOLD).length;
  const hasContradiction = perPointScores.some((s) => s < -COVERED_THRESHOLD);

  return {
    marks: Math.round(final * maximumMarks),
    similarity_score: final,
    feedback: buildFeedback(final, coveredCount, keyPoints.length, hasContradiction),
  };
}

function buildFeedback(final, coveredCount, totalKeyPoints, hasContradiction) {
  let band;
  if (final >= 0.85) band = 'Strong match with the reference answer.';
  else if (final >= 0.6) band = 'Good match with the reference answer, with some gaps.';
  else if (final >= 0.3) band = 'Partial match with the reference answer; several key points are missing.';
  else band = 'Does not adequately address the reference answer.';

  const coverage = totalKeyPoints > 1 ? ` Addresses ${coveredCount} of ${totalKeyPoints} key points.` : '';
  const contradictionNote = hasContradiction ? ' Contains a statement that contradicts the reference answer.' : '';

  return `${band}${coverage}${contradictionNote}`;
}

module.exports = { embedText, embedTexts, scoreAnswer, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, NLI_MODEL };
