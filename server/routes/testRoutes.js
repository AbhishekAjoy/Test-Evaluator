const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');
const requireRole = require('../middlewares/roleMiddleware');

router.get('/test', testController.getTestsByClass);           // ?classId=...
router.get('/test/questions', testController.getQuestionsByTest); // ?testId=...
router.post('/test', requireRole('teacher', 'admin'), testController.createTest);
router.post('/test/:testId/questions', requireRole('teacher', 'admin'), testController.addQuestionsToTest);

module.exports = router;
