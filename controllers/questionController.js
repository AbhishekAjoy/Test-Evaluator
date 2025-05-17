const pool = require('../models/db');

// GET /questions
exports.getAllQuestions = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM questions');
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /question/:id
exports.getQuestionById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM questions WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /question
exports.createQuestion = async (req, res) => {
  const { question, referenceAnswer, questionType, options, maximumMarks } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO questions (question, referenceAnswer, questionType, options, maximumMarks)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [question, referenceAnswer, questionType, options || null, maximumMarks || 1]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /question/:id
exports.updateQuestion = async (req, res) => {
  const { id } = req.params;
  const { question, referenceAnswer, questionType, options, maximumMarks } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM questions WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const updated = await pool.query(
      `UPDATE questions
       SET question = COALESCE($1, question),
           referenceAnswer = COALESCE($2, referenceAnswer),
           questionType = COALESCE($3, questionType),
           options = COALESCE($4, options),
           maximumMarks = COALESCE($5, maximumMarks)
       WHERE id = $6
       RETURNING *`,
      [question, referenceAnswer, questionType, options, maximumMarks, id]
    );

    res.status(200).json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /question/:id
exports.deleteQuestion = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM questions WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.status(200).json({ message: 'Question deleted', deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
