const Anthropic = require('@anthropic-ai/sdk');
const { pipeline } = require('@huggingface/transformers');
require('dotenv').config();

// Runs locally (ONNX, CPU) via @huggingface/transformers - no API key, no per-call cost,
// no external account. Produces 384-dimensional vectors; textbook_chunks.embedding is
// sized to match (see db/migrations/002_llm_pipeline.sql). Anthropic has no embeddings
// model of its own, so this is a genuinely different provider, not a same-vendor swap.
const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5';
const EMBEDDING_DIMENSIONS = 384;
const GRADING_MODEL = 'claude-haiku-4-5-20251001';

// The Anthropic SDK throws at construction time if the API key is missing, so the client
// is built lazily on first use - otherwise the whole server would fail to boot (login
// included) any time the key isn't configured yet, instead of only grading failing.
let anthropicClient;
function getAnthropic() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

// Loading the model is expensive (pulls ~100MB of ONNX weights into memory on first
// call, cached on disk after), so the pipeline is built once and reused, not per call.
let embedderPromise;
function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = pipeline('feature-extraction', EMBEDDING_MODEL);
  }
  return embedderPromise;
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

const GRADE_TOOL = {
  name: 'submit_grade',
  description: "Submit the grade for a student's answer",
  input_schema: {
    type: 'object',
    properties: {
      marks: { type: 'number', description: 'Marks awarded for the answer' },
      similarity_score: {
        type: 'number',
        description: 'Semantic similarity of the answer to the correct answer, from 0 to 1',
      },
      feedback: { type: 'string', description: 'One or two sentences of feedback explaining the grade' },
    },
    required: ['marks', 'similarity_score', 'feedback'],
  },
};

// Grades a student's descriptive answer against the reference answer and retrieved
// textbook context. Returns { marks, similarity_score, feedback }, marks clamped to
// [0, maximumMarks] and similarity_score clamped to [0, 1] regardless of what the
// model returns.
async function gradeAnswer({ questionText, referenceAnswer, contextText, studentAnswer, maximumMarks }) {
  const prompt = `You are grading a student's answer to a descriptive exam question.

Question: ${questionText}

Reference answer (from the teacher): ${referenceAnswer}
${contextText ? `\nRelevant textbook context:\n${contextText}\n` : ''}
Student's answer: ${studentAnswer}

Grade the student's answer out of ${maximumMarks} marks based on semantic correctness and
completeness relative to the reference answer and textbook context, not exact wording.
Award partial credit where appropriate.`;

  const message = await getAnthropic().messages.create({
    model: GRADING_MODEL,
    max_tokens: 512,
    tools: [GRADE_TOOL],
    tool_choice: { type: 'tool', name: 'submit_grade' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Grading model did not return a grade');
  }

  const { marks, similarity_score, feedback } = toolUse.input;
  return {
    marks: Math.max(0, Math.min(maximumMarks, marks)),
    similarity_score: Math.max(0, Math.min(1, similarity_score)),
    feedback,
  };
}

module.exports = { embedText, embedTexts, gradeAnswer, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, GRADING_MODEL };
