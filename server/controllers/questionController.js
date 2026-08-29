const pool = require('../models/db');

// Only the teacher who created a question (or an admin) may modify/delete it.
// A null created_by (a question predating ownership tracking) falls back to
// permissive - there's no owner recorded to check against.
function canModify(user, question) {
  if (user.role === 'admin') return true;
  return question.created_by === null || question.created_by === user.id;
}

// GET /questions  (teacher/admin only - this is the raw question bank, answers included)
exports.getAllQuestions = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM questions');
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /question/:id  (teacher/admin only)
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

// POST /question  (teacher/admin only)
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

// PATCH /question/:id  (the question's own creator, or admin)
exports.updateQuestion = async (req, res) => {
  const { id } = req.params;
  const { question, reference_answer, question_type, options, maximum_marks, correct_answer } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM questions WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    if (!canModify(req.user, existing.rows[0])) {
      return res.status(403).json({ error: 'Only the question author can update this question' });
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

// DELETE /question/:id  (the question's own creator, or admin)
exports.deleteQuestion = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await pool.query('SELECT * FROM questions WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    if (!canModify(req.user, existing.rows[0])) {
      return res.status(403).json({ error: 'Only the question author can delete this question' });
    }

    const result = await pool.query('DELETE FROM questions WHERE id = $1 RETURNING *', [id]);
    res.status(200).json({ message: 'Question deleted', deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
