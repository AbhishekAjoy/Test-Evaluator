const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');
const auth = require('../middlewares/authMiddleware');

// Role-based auth check can be added here if needed

router.post('/', classController.createClass);
router.post('/add-teacher', classController.addTeacherToClass);
router.post('/add-student', classController.addStudentToClass);
router.get('/', classController.getClasses);
router.get('/view-students', classController.getClassStudents);
router.get('/view-teachers', classController.getClassTeachers);

module.exports = router;
