const pool = require('../models/db');

// Whether a user has any relationship to a class: enrolled (student), assigned
// (teacher), or admin (always true). Used to scope class-adjacent reads (rosters,
// tests, textbooks) so someone with no connection to a class can't browse it.
async function hasClassAccess(user, classId) {
  if (user.role === 'admin') return true;

  if (user.role === 'teacher') {
    const r = await pool.query(
      'SELECT 1 FROM class_teachers WHERE teacher_id = $1 AND class_id = $2',
      [user.id, classId]
    );
    return r.rows.length > 0;
  }

  if (user.role === 'student') {
    const r = await pool.query(
      'SELECT 1 FROM class_students WHERE student_id = $1 AND class_id = $2',
      [user.id, classId]
    );
    return r.rows.length > 0;
  }

  return false;
}

module.exports = { hasClassAccess };
