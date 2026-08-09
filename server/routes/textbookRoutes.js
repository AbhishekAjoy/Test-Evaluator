const express = require('express');
const router = express.Router();
const textbookController = require('../controllers/textbookController');
const requireRole = require('../middlewares/roleMiddleware');
const upload = require('../middlewares/upload');

router.get('/textbook', textbookController.getTextbooksByClass); // ?classId=...
router.post('/textbook', requireRole('teacher', 'admin'), upload.single('file'), textbookController.uploadTextbook);

module.exports = router;
