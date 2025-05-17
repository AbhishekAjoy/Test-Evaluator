const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const auth = require('../middlewares/authMiddleware'); // optional if you want to protect these

router.get('/questions', questionController.getAllQuestions);
router.get('/question/:id', questionController.getQuestionById);
router.post('/question', questionController.createQuestion);
router.patch('/question/:id', questionController.updateQuestion);
router.delete('/question/:id', questionController.deleteQuestion);

module.exports = router;