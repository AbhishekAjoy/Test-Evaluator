const pool = require('../models/db');
const { embedText, scoreAnswer } = require('./localModelService');
const { toSql } = require('pgvector/pg');

const TOP_K_CHUNKS = 4;

// Retrieval runs once per (test, question) and is cached - every student answering the
// same question on the same test reuses it instead of triggering a fresh vector search.
async function getContextForQuestion(testId, questionId, questionText, referenceAnswer) {
  const cached = await pool.query(
    'SELECT context_text FROM test_question_context WHERE test_id = $1 AND question_id = $2',
    [testId, questionId]
  );
  if (cached.rows.length > 0) {
    return cached.rows[0].context_text;
  }

  const queryEmbedding = await embedText(`${questionText}\n${referenceAnswer || ''}`);

  const chunks = await pool.query(
    `SELECT tc.chunk_text
     FROM textbook_chunks tc
     JOIN textbooks tb ON tb.id = tc.textbook_id
     WHERE tb.class_id IN (SELECT class_id FROM test_classes WHERE test_id = $1)
       AND tb.processing_status = 'ready'
     ORDER BY tc.embedding <=> $2
     LIMIT $3`,
    [testId, toSql(queryEmbedding), TOP_K_CHUNKS]
  );

  const contextText = chunks.rows.map((r) => r.chunk_text).join('\n\n');

  if (contextText) {
    await pool.query(
      `INSERT INTO test_question_context (test_id, question_id, context_text)
       VALUES ($1, $2, $3)
       ON CONFLICT (test_id, question_id) DO NOTHING`,
      [testId, questionId, contextText]
    );
  }

  return contextText;
}

// Grades a single descriptive response. Returns the grading result, or null if grading
// could not complete (e.g. a model failed to load) - the caller leaves marks as NULL so
// the response stays a valid candidate for a later retry via the regrade endpoint.
async function gradeDescriptiveResponse({ testId, question, studentAnswer }) {
  try {
    const contextText = await getContextForQuestion(
      testId,
      question.id,
      question.question,
      question.reference_answer
    );

    const result = await scoreAnswer({
      referenceAnswer: question.reference_answer,
      contextText,
      studentAnswer,
      maximumMarks: question.maximum_marks,
    });

    return { ...result, graded_at: new Date() };
  } catch (err) {
    console.error(`Grading failed for question ${question.id} on test ${testId}:`, err.message);
    return null;
  }
}

module.exports = { gradeDescriptiveResponse, getContextForQuestion };
