const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');

router.get('/test', testController.getTestsByClass);           // ?classId=...
router.get('/test/questions', testController.getQuestionsByTest); // ?testId=...

module.exports = router;
