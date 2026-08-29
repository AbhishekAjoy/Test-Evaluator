const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');
const requireRole = require('../middlewares/roleMiddleware');

// Role-based auth check can be added here if needed

router.post('/', classController.createClass);
router.post('/add-teacher', requireRole('admin'), classController.addTeacherToClass);
router.post('/add-student', requireRole('teacher', 'admin'), classController.addStudentToClass);
router.post('/:classId/bulk-students', requireRole('teacher', 'admin'), classController.bulkAddStudents);
router.get('/', classController.getClasses);
router.get('/view-students/:classId', classController.getClassStudents);
router.get('/view-teachers/:classId', classController.getClassTeachers);

module.exports = router;
