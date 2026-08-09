const express = require('express');
const router = express.Router();
const responseController = require('../controllers/responseController');
const requireRole = require('../middlewares/roleMiddleware');

router.get('/response', responseController.getAllResponses);
router.get('/response/:id', responseController.getResponseById);
router.post('/response', requireRole('student'), responseController.submitResponse);

module.exports = router;
