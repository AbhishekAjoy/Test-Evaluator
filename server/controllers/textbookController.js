const fs = require('fs');
const pdfParse = require('pdf-parse');
const pool = require('../models/db');
const { chunkText } = require('../services/textChunker');
const { embedTexts } = require('../services/llmService');
const { toSql } = require('pgvector/pg');

// POST /textbook  multipart/form-data: { class_id, title, file }  (teacher/admin only)
// Responds immediately once the upload is stored, then extracts/chunks/embeds the PDF
// in the background - a textbook can take a while to process and there's no job queue
// here, so processing_status (pending/processing/ready/failed) is what a client polls.
exports.uploadTextbook = async (req, res) => {
  const { class_id, title } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'A PDF file is required' });
  }
  if (!class_id || !title) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'class_id and title are required' });
  }

  if (req.user.role === 'teacher') {
    const owned = await pool.query('SELECT 1 FROM class_teachers WHERE teacher_id = $1 AND class_id = $2', [
      req.user.id,
      class_id,
    ]);
    if (owned.rows.length === 0) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'You are not assigned to this class' });
    }
  }

  let textbook;
  try {
    const inserted = await pool.query(
      `INSERT INTO textbooks (class_id, title, file_path, uploaded_by, processing_status)
       VALUES ($1, $2, $3, $4, 'processing') RETURNING *`,
      [class_id, title, req.file.path, req.user.id]
    );
    textbook = inserted.rows[0];
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    if (err.code === '23503') {
      return res.status(400).json({ error: 'class_id does not exist' });
    }
    return res.status(500).json({ error: err.message });
  }

  res.status(202).json({ ...textbook, message: 'Upload received, processing in background' });

  processTextbook(textbook).catch((err) => {
    console.error(`Failed to process textbook ${textbook.id}:`, err.message);
    pool.query("UPDATE textbooks SET processing_status = 'failed' WHERE id = $1", [textbook.id]).catch(() => {});
  });
};

async function processTextbook(textbook) {
  const buffer = fs.readFileSync(textbook.file_path);
  const { text } = await pdfParse(buffer);

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    throw new Error('No extractable text found in PDF');
  }

  const embeddings = await embedTexts(chunks);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE textbooks SET extracted_text = $1 WHERE id = $2', [text, textbook.id]);
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO textbook_chunks (textbook_id, chunk_index, chunk_text, embedding)
         VALUES ($1, $2, $3, $4)`,
        [textbook.id, i, chunks[i], toSql(embeddings[i])]
      );
    }
    await client.query("UPDATE textbooks SET processing_status = 'ready' WHERE id = $1", [textbook.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// GET /textbook?classId=...
exports.getTextbooksByClass = async (req, res) => {
  const { classId } = req.query;
  if (!classId) {
    return res.status(400).json({ error: 'classId query parameter is required' });
  }
  try {
    const result = await pool.query(
      'SELECT id, class_id, title, processing_status, uploaded_by, uploaded_at FROM textbooks WHERE class_id = $1',
      [classId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
