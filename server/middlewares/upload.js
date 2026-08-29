const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'textbooks');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  // Ignore the client-supplied filename entirely (path traversal / collisions) - generate our own.
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
});

function pdfFileFilter(req, file, cb) {
  if (file.mimetype !== 'application/pdf') {
    return cb(new Error('Only PDF files are accepted'));
  }
  cb(null, true);
}

module.exports = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

module.exports.UPLOAD_DIR = UPLOAD_DIR;
