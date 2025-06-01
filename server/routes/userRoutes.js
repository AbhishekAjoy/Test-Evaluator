const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/',userController.createUser);
router.post('/login', userController.login);
// Add other routes: GET, PUT, DELETE

module.exports = router;
