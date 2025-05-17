const pool = require('../models/db');

// GET /response → get all responses
exports.getAllResponses = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM responses');
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /response/:id → get response by response ID
exports.getResponseById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM responses WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Response not found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
