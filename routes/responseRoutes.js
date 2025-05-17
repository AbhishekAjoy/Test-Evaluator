const express = require('express');
const router = express.Router();
const responseController = require('../controllers/responseController');
const auth = require('../middlewares/authMiddleware'); // optional if needed

router.get('/response', responseController.getAllResponses);
router.get('/response/:id', responseController.getResponseById);

module.exports = router;
