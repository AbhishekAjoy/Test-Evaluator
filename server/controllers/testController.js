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
      `SELECT q.*, tq.position
       FROM questions q
       JOIN test_questions tq ON q.id = tq.question_id
       WHERE tq.test_id = $1
       ORDER BY tq.position NULLS LAST`,
      [testId]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching questions for test:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /test  { title, description?, start_time?, end_time?, class_ids: [...] }
exports.createTest = async (req, res) => {
  const { title, description, start_time, end_time, class_ids } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!Array.isArray(class_ids) || class_ids.length === 0) {
    return res.status(400).json({ error: 'class_ids must be a non-empty array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Teachers may only assign a test to classes they actually teach; admins bypass this check.
    if (req.user.role === 'teacher') {
      const owned = await client.query(
        'SELECT class_id FROM class_teachers WHERE teacher_id = $1 AND class_id = ANY($2::int[])',
        [req.user.id, class_ids]
      );
      const ownedIds = new Set(owned.rows.map((r) => r.class_id));
      const notOwned = class_ids.filter((id) => !ownedIds.has(id));
      if (notOwned.length > 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: `Not assigned to class(es): ${notOwned.join(', ')}` });
      }
    }

    const testResult = await client.query(
      `INSERT INTO tests (title, description, author_id, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, description || null, req.user.id, start_time || null, end_time || null]
    );
    const test = testResult.rows[0];

    for (const classId of class_ids) {
      await client.query('INSERT INTO test_classes (test_id, class_id) VALUES ($1, $2)', [test.id, classId]);
    }

    await client.query('COMMIT');
    res.status(201).json({ ...test, class_ids });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') {
      return res.status(400).json({ error: 'One or more class_ids do not exist' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'end_time must be after start_time' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// POST /test/:testId/questions  { question_ids: [...] }
// Appends questions to the end of the test in array order.
exports.addQuestionsToTest = async (req, res) => {
  const { testId } = req.params;
  const { question_ids } = req.body;

  if (!Array.isArray(question_ids) || question_ids.length === 0) {
    return res.status(400).json({ error: 'question_ids must be a non-empty array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const testResult = await client.query('SELECT * FROM tests WHERE id = $1', [testId]);
    if (testResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Test not found' });
    }
    const test = testResult.rows[0];

    if (req.user.role === 'teacher' && test.author_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the test author can add questions to this test' });
    }

    const positionResult = await client.query(
      'SELECT COALESCE(MAX(position), 0) AS max_position FROM test_questions WHERE test_id = $1',
      [testId]
    );
    let nextPosition = positionResult.rows[0].max_position + 1;

    const added = [];
    for (const questionId of question_ids) {
      const inserted = await client.query(
        `INSERT INTO test_questions (test_id, question_id, position)
         VALUES ($1, $2, $3)
         ON CONFLICT (test_id, question_id) DO NOTHING
         RETURNING *`,
        [testId, questionId, nextPosition]
      );
      if (inserted.rows.length > 0) {
        added.push(inserted.rows[0]);
        nextPosition++;
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ testId: Number(testId), added });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') {
      return res.status(400).json({ error: 'One or more question_ids do not exist' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// PATCH /test/:id  { title?, description?, start_time?, end_time?, status?, results_published? }
exports.updateTest = async (req, res) => {
  const { id } = req.params;
  const { title, description, start_time, end_time, status, results_published } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM tests WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }
    const test = existing.rows[0];

    if (req.user.role === 'teacher' && test.author_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the test author can update this test' });
    }

    // Results can't go out while the test is still open (or never happened) for submissions.
    const nextStatus = status !== undefined ? status : test.status;
    if (results_published === true && nextStatus !== 'closed') {
      return res.status(400).json({ error: 'Results can only be published once the test is closed' });
    }

    const updated = await pool.query(
      `UPDATE tests
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           start_time = COALESCE($3, start_time),
           end_time = COALESCE($4, end_time),
           status = COALESCE($5, status),
           results_published = COALESCE($6, results_published),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [title, description, start_time, end_time, status, results_published, id]
    );

    res.status(200).json(updated.rows[0]);
  } catch (err) {
    if (err.code === '23514') {
      return res.status(400).json({ error: 'Invalid status value, or end_time is not after start_time' });
    }
    res.status(500).json({ error: err.message });
  }
};
