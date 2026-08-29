const pool = require("../models/db");
const bcrypt = require("bcrypt");
const { generatePassword } = require("../utils/password");

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
    res.status(200).json({ classes: result.rows });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /add-student  (teacher assigned to this class, or admin)
// Enrolls an already-existing student account - for creating a new student and
// enrolling them in one step, see bulkAddStudents below.
exports.addStudentToClass = async (req, res) => {
  const { classId, studentId } = req.body;

  if (req.user.role === "teacher") {
    const owned = await pool.query(
      "SELECT 1 FROM class_teachers WHERE teacher_id = $1 AND class_id = $2",
      [req.user.id, classId]
    );
    if (owned.rows.length === 0) {
      return res.status(403).json({ error: "You are not assigned to this class" });
    }
  }

  try {
    const target = await pool.query("SELECT role FROM users WHERE id = $1", [studentId]);
    if (target.rows.length === 0 || target.rows[0].role !== "student") {
      return res.status(400).json({ error: "studentId must refer to an existing student account" });
    }

    await pool.query(
      "INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)",
      [classId, studentId]
    );
    res.status(200).json({ message: "Student added to class" });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Student is already enrolled in this class" });
    }
    if (err.code === "23503") {
      return res.status(400).json({ error: "classId does not exist" });
    }
    res.status(500).json({ error: err.message });
  }
};

// POST /add-teacher  (admin only)
// Assigning a teacher to co-teach a class is an org-management action, same trust
// level as creating the teacher account in the first place - not something a teacher
// can do to themselves or another teacher.
exports.addTeacherToClass = async (req, res) => {
  const { classId, teacherId } = req.body;
  try {
    const target = await pool.query("SELECT role FROM users WHERE id = $1", [teacherId]);
    if (target.rows.length === 0 || target.rows[0].role !== "teacher") {
      return res.status(400).json({ error: "teacherId must refer to an existing teacher account" });
    }

    await pool.query(
      "INSERT INTO class_teachers (class_id, teacher_id) VALUES ($1, $2)",
      [classId, teacherId]
    );
    res.status(200).json({ message: "Teacher added to class" });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Teacher is already assigned to this class" });
    }
    if (err.code === "23503") {
      return res.status(400).json({ error: "classId does not exist" });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.getClassStudents = async (req, res) => {
  const { classId } = req.params;
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

// POST /:classId/bulk-students  (teacher assigned to this class, or admin)
// { students: [{ name, email, password? }, ...] }
// Creates each student account and enrolls them in this class in one step - class
// enrollment was always the thing that actually matters, so account creation and
// enrollment happen together instead of as two separate privileged actions.
exports.bulkAddStudents = async (req, res) => {
  const { classId } = req.params;
  const { students } = req.body;

  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: "students must be a non-empty array" });
  }

  if (req.user.role === "teacher") {
    const owned = await pool.query(
      "SELECT 1 FROM class_teachers WHERE teacher_id = $1 AND class_id = $2",
      [req.user.id, classId]
    );
    if (owned.rows.length === 0) {
      return res.status(403).json({ error: "You are not assigned to this class" });
    }
  }

  const created = [];
  const failed = [];

  for (const [index, entry] of students.entries()) {
    const { name, email } = entry || {};
    let password = entry && entry.password;

    if (!name || !email) {
      failed.push({ index, email, error: "name and email are required" });
      continue;
    }

    const generated = !password;
    if (generated) password = generatePassword();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const password_hash = await bcrypt.hash(password, 10);
      const userResult = await client.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'student') RETURNING id, name, email",
        [name, email, password_hash]
      );
      const student = userResult.rows[0];
      await client.query(
        "INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)",
        [classId, student.id]
      );
      await client.query("COMMIT");
      created.push({ ...student, ...(generated ? { generatedPassword: password } : {}) });
    } catch (err) {
      await client.query("ROLLBACK");
      const message =
        err.code === "23505" ? "Email already exists" :
        err.code === "23503" ? "classId does not exist" :
        err.message;
      failed.push({ index, email, error: message });
    } finally {
      client.release();
    }
  }

  res.status(200).json({ created, failed });
};

exports.getClassTeachers = async (req, res) => {
  const { classId } = req.params;
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email
            FROM users u
            JOIN class_teachers ct ON ct.teacher_id = u.id
            WHERE ct.class_id = $1 AND u.role = 'teacher'`,
      [classId]
    );
    res.status(200).json({ teachers: result.rows });
  } catch (err) {
    console.error("Error fetching teachers for class:", err);
    res.status(500).json({ error: "Failed to retrieve teachers" });
  }
};
