const pool = require('../models/db');

// GET /test?classId=...
exports.getTestsByClass = async (req, res) => {
  const { classId } = req.query;

  if (!classId) {
    return res.status(400).json({ error: 'classId query parameter is required' });
  }

  try {
    const result = await pool.query(
      `SELECT t.*
       FROM tests t
       JOIN test_classes tc ON t.id = tc.test_id
       WHERE tc.class_id = $1`,
      [classId]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching tests for class:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /test/questions?testId=...
exports.getQuestionsByTest = async (req, res) => {
  const { testId } = req.query;

  if (!testId) {
    return res.status(400).json({ error: 'testId query parameter is required' });
  }

  try {
    const result = await pool.query(
      `SELECT q.*
       FROM questions q
       JOIN test_questions tq ON q.id = tq.question_id
       WHERE tq.test_id = $1`,
      [testId]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching questions for test:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
