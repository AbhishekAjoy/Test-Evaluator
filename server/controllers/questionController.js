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
  const { question, question_type, reference_answer, correct_answer, options, maximum_marks } = req.body;

  if (question_type === 'MCQ' && (!correct_answer || !options || options.length < 2)) {
    return res.status(400).json({ error: 'MCQ questions require at least two options and a correct_answer' });
  }
  if (question_type === 'descriptive' && !reference_answer) {
    return res.status(400).json({ error: 'Descriptive questions require a reference_answer' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO questions (question, reference_answer, question_type, options, maximum_marks, correct_answer, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [question, reference_answer || null, question_type, options || null, maximum_marks || 1, correct_answer || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /question/:id
exports.updateQuestion = async (req, res) => {
  const { id } = req.params;
  const { question, reference_answer, question_type, options, maximum_marks, correct_answer } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM questions WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const updated = await pool.query(
      `UPDATE questions
       SET question = COALESCE($1, question),
           reference_answer = COALESCE($2, reference_answer),
           question_type = COALESCE($3, question_type),
           options = COALESCE($4, options),
           maximum_marks = COALESCE($5, maximum_marks),
           correct_answer = COALESCE($6, correct_answer)
       WHERE id = $7
       RETURNING *`,
      [question, reference_answer, question_type, options, maximum_marks, correct_answer, id]
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
