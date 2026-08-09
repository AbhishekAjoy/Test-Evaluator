const pool = require('../models/db');
const { gradeDescriptiveResponse } = require('../services/gradingService');

// GET /response → get responses visible to the caller
// students see their own; teachers see responses for tests they authored; admins see everything.
exports.getAllResponses = async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await pool.query('SELECT * FROM responses');
    } else if (req.user.role === 'teacher') {
      result = await pool.query(
        `SELECT r.* FROM responses r
         JOIN tests t ON t.id = r.test_id
         WHERE t.author_id = $1`,
        [req.user.id]
      );
    } else {
      result = await pool.query('SELECT * FROM responses WHERE student_id = $1', [req.user.id]);
    }
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /response/:id → get response by response ID, if the caller is allowed to see it
exports.getResponseById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT r.*, t.author_id AS test_author_id
       FROM responses r
       JOIN tests t ON t.id = r.test_id
       WHERE r.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Response not found' });
    }

    const response = result.rows[0];
    const isOwner = req.user.role === 'student' && response.student_id === req.user.id;
    const isAuthor = req.user.role === 'teacher' && response.test_author_id === req.user.id;
    if (req.user.role !== 'admin' && !isOwner && !isAuthor) {
      return res.status(403).json({ error: 'Not authorized to view this response' });
    }

    delete response.test_author_id;
    res.status(200).json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /response  { test_id, question_id, answer }  (student only)
// MCQ answers are auto-graded immediately. Descriptive answers are graded synchronously
// by the LLM pipeline (retrieval + Claude-as-judge); if that call fails, the response is
// still saved with marks = NULL so the answer isn't lost - a teacher can retry it later
// via POST /test/:id/regrade.
exports.submitResponse = async (req, res) => {
  const { test_id, question_id, answer } = req.body;
  const studentId = req.user.id;

  if (!test_id || !question_id || answer === undefined || answer === null || answer === '') {
    return res.status(400).json({ error: 'test_id, question_id, and answer are required' });
  }

  try {
    const testResult = await pool.query('SELECT * FROM tests WHERE id = $1', [test_id]);
    if (testResult.rows.length === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }
    const test = testResult.rows[0];

    if (test.status !== 'published') {
      return res.status(403).json({ error: 'This test is not currently open for submissions' });
    }
    const now = new Date();
    if (test.start_time && now < new Date(test.start_time)) {
      return res.status(403).json({ error: 'This test has not started yet' });
    }
    if (test.end_time && now > new Date(test.end_time)) {
      return res.status(403).json({ error: 'This test has already closed' });
    }

    const enrolled = await pool.query(
      `SELECT 1 FROM class_students cs
       JOIN test_classes tc ON tc.class_id = cs.class_id
       WHERE tc.test_id = $1 AND cs.student_id = $2`,
      [test_id, studentId]
    );
    if (enrolled.rows.length === 0) {
      return res.status(403).json({ error: 'You are not enrolled in a class this test is assigned to' });
    }

    const questionResult = await pool.query(
      `SELECT q.* FROM questions q
       JOIN test_questions tq ON tq.question_id = q.id
       WHERE tq.test_id = $1 AND q.id = $2`,
      [test_id, question_id]
    );
    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question does not belong to this test' });
    }
    const question = questionResult.rows[0];

    let marks = null;
    let similarity_score = null;
    let feedback = null;
    let graded_at = null;

    if (question.question_type === 'MCQ') {
      marks = answer === question.correct_answer ? question.maximum_marks : 0;
      graded_at = new Date();
    } else {
      const graded = await gradeDescriptiveResponse({ testId: test_id, question, studentAnswer: answer });
      if (graded) {
        ({ marks, similarity_score, feedback, graded_at } = graded);
      }
    }

    const inserted = await pool.query(
      `INSERT INTO responses (test_id, student_id, question_id, answer, marks, similarity_score, feedback, graded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [test_id, studentId, question_id, answer, marks, similarity_score, feedback, graded_at]
    );

    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You have already submitted a response for this question' });
    }
    res.status(500).json({ error: err.message });
  }
};
