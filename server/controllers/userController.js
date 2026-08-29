const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../models/db');
const { generatePassword } = require('../utils/password');
require('dotenv').config();

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
};

function friendlyDbError(err) {
  if (err.code === '23505') return 'A user with this email already exists';
  if (err.code === '23514') return 'Invalid role';
  return err.message;
}

// POST /  (admin only) - create a single account of any role.
// No token is issued here - it belongs to the new account, not the admin creating it.
exports.createUser = async (req, res) => {
  const { name, email, role } = req.body;
  let { password } = req.body;

  if (!name || !email || !role) {
    return res.status(400).json({ error: 'name, email, and role are required' });
  }

  const generated = !password;
  if (generated) password = generatePassword();

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, is_active, created_at',
      [name, email, password_hash, role]
    );
    res.status(201).json({ user: result.rows[0], ...(generated ? { generatedPassword: password } : {}) });
  } catch (err) {
    const status = err.code === '23505' || err.code === '23514' ? 400 : 500;
    res.status(status).json({ error: friendlyDbError(err) });
  }
};

// POST /bulk  (admin only)  { users: [{ name, email, role, password? }, ...] }
// Best-effort per row - one bad entry doesn't block the rest of the batch.
exports.bulkCreateUsers = async (req, res) => {
  const { users } = req.body;
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'users must be a non-empty array' });
  }

  const created = [];
  const failed = [];

  for (const [index, entry] of users.entries()) {
    const { name, email, role } = entry || {};
    let password = entry && entry.password;

    if (!name || !email || !role) {
      failed.push({ index, email, error: 'name, email, and role are required' });
      continue;
    }

    const generated = !password;
    if (generated) password = generatePassword();

    try {
      const password_hash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
        [name, email, password_hash, role]
      );
      created.push({ ...result.rows[0], ...(generated ? { generatedPassword: password } : {}) });
    } catch (err) {
      failed.push({ index, email, error: friendlyDbError(err) });
    }
  }

  res.status(200).json({ created, failed });
};

// PATCH /:id/status  (admin only)  { is_active: boolean }
exports.setUserStatus = async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active (boolean) is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, email, role, is_active',
      [is_active, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

    if (!user.is_active) return res.status(403).json({ error: 'Account is deactivated' });

    const token = generateToken(user);

    res.json({ message: 'Login successful', token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
