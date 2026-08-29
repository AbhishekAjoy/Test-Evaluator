const jwt = require('jsonwebtoken');
const pool = require('../models/db');
require('dotenv').config();

// Checks is_active on every request, not just at login, so a deactivation takes effect
// immediately instead of only blocking future logins - trades the usual "no DB hit"
// benefit of stateless JWTs for real-time revocation, deliberately, since JWT_EXPIRES_IN
// is long enough (9h) that waiting out a stale token would otherwise be a real gap.
module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query('SELECT is_active FROM users WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};
