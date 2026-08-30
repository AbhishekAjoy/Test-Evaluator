const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/roleMiddleware');

router.post('/login', userController.login);
router.post('/refresh', userController.refresh);
router.post('/logout', userController.logout);
router.get('/', authMiddleware, requireRole('admin'), userController.listUsers);
router.post('/', authMiddleware, requireRole('admin'), userController.createUser);
router.post('/bulk', authMiddleware, requireRole('admin'), userController.bulkCreateUsers);
router.patch('/:id/status', authMiddleware, requireRole('admin'), userController.setUserStatus);

module.exports = router;
