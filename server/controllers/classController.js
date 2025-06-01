const pool = require("../models/db");

exports.createClass = async (req, res) => {
  const { name, description } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO classes (name, description) VALUES ($1, $2) RETURNING *",
      [name, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getClasses = async (req, res) => {
  try{
    const result = await pool.query(
      `SELECT c.id, c.name, c.description
       FROM classes c`
    );
    res.status(200).json({ students: result.rows });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}

exports.addStudentToClass = async (req, res) => {
  const { classId, studentId } = req.body;
  try {
    await pool.query(
      "INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)",
      [classId, studentId]
    );
    res.status(200).json({ message: "Student added to class" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addTeacherToClass = async (req, res) => {
  const { classId, teacherId } = req.body;
  try {
    await pool.query(
      "INSERT INTO class_teachers (class_id, teacher_id) VALUES ($1, $2)",
      [classId, teacherId]
    );
    res.status(200).json({ message: "Teacher added to class" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getClassStudents = async (req, res) => {
  const { classId } = req.body;
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email
       FROM users u
       JOIN class_students cs ON cs.student_id = u.id
       WHERE cs.class_id = $1 AND u.role = 'student'`,
      [classId]
    );
    res.status(200).json({ students: result.rows });
  } catch (err) {
    console.error("Error fetching students for class:", err);
    res.status(500).json({ error: "Failed to retrieve students" });
  }
};

exports.getClassTeachers = async (req, res) => {
  const { classId } = req.body;
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email
            FROM users u
            JOIN class_teachers ct ON ct.teacher_id = u.id
            WHERE cs.class_id = $1 AND u.role = 'teacher'`,
      [classId]
    );
    res.status(200).json({ teachers: result.rows });
  } catch (err) {
    console.error("Error fetching teachers for class:", err);
    res.status(500).json({ error: "Failed to retrieve teachers" });
  }
};
