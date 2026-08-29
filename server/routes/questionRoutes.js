const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const requireRole = require('../middlewares/roleMiddleware');

// The raw question bank (answers included) is teacher/admin territory only. Students
// only ever see questions through GET /tests/test/questions, which strips answer fields.
router.get('/questions', requireRole('teacher', 'admin'), questionController.getAllQuestions);
router.get('/question/:id', requireRole('teacher', 'admin'), questionController.getQuestionById);
router.post('/question', requireRole('teacher', 'admin'), questionController.createQuestion);
router.patch('/question/:id', requireRole('teacher', 'admin'), questionController.updateQuestion);
router.delete('/question/:id', requireRole('teacher', 'admin'), questionController.deleteQuestion);

module.exports = router;
