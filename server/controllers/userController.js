const bcrypt = require('bcrypt');
const pool = require('../models/db');
const { generatePassword } = require('../utils/password');
const tokenService = require('../services/tokenService');
require('dotenv').config();

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

    // Kills every outstanding refresh session immediately, not just future access-token
    // checks - otherwise a deactivated user's refresh token sits there until it
    // naturally expires, uselessly (authMiddleware would reject anything it mints) but
    // not actually gone.
    if (!is_active) {
      await tokenService.revokeAllRefreshTokensForUser(id);
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

    const accessToken = tokenService.generateAccessToken(user);
    const { rawToken: refreshToken } = await tokenService.issueRefreshToken(user.id);
    tokenService.setRefreshCookie(res, refreshToken);

    res.json({ message: 'Login successful', token: accessToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /refresh - reads the refresh token from its httpOnly cookie (never from the
// request body/header - that's the whole point). Rotates on every use within the same
// family. If a token that's already been rotated out gets presented again, that's either
// a legitimate concurrent retry (a network hiccup duplicating the request) or an attacker
// replaying a stolen token - see tokenService.REUSE_GRACE_MS for how those are told apart.
exports.refresh = async (req, res) => {
  const rawToken = req.cookies?.[tokenService.REFRESH_COOKIE_NAME];
  if (!rawToken) return res.status(401).json({ error: 'Missing refresh token' });

  try {
    const tokenRow = await tokenService.findRefreshTokenByHash(rawToken);
    if (!tokenRow) {
      tokenService.clearRefreshCookie(res);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (tokenRow.revoked_at) {
      // Grace-window forgiveness requires BOTH: revoked recently enough to plausibly be
      // a retry, AND the family still has a live token elsewhere. That second check is
      // what stops a token from an already-fully-killed family (every member revoked in
      // the same instant by a prior theft-detection event) from re-qualifying for
      // forgiveness just because it also "looks recently revoked" - without it, replaying
      // any token from a family that was just mass-revoked would itself look like an
      // innocent retry and undo the revocation's entire purpose.
      const recent = tokenService.isWithinReuseGrace(tokenRow);
      const familyStillAlive = recent && (await tokenService.familyHasValidToken(tokenRow.family_id));

      if (familyStillAlive) {
        console.warn(`Refresh token reuse within grace window for family ${tokenRow.family_id} - treated as a retry.`);
        return issueAndRespond(res, tokenRow.user_id, tokenRow.family_id);
      }

      console.warn(`Refresh token reuse for family ${tokenRow.family_id} - revoking entire family.`);
      await tokenService.revokeFamily(tokenRow.family_id);
      tokenService.clearRefreshCookie(res);
      return res.status(401).json({ error: 'Session invalidated - possible token reuse detected' });
    }

    if (tokenRow.expires_at <= new Date()) {
      tokenService.clearRefreshCookie(res);
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [tokenRow.user_id]);
    const user = userResult.rows[0];

    if (!user || !user.is_active) {
      await tokenService.revokeFamily(tokenRow.family_id);
      tokenService.clearRefreshCookie(res);
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    await tokenService.revokeRefreshToken(tokenRow.id);
    return issueAndRespond(res, user.id, tokenRow.family_id, user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

async function issueAndRespond(res, userId, familyId, userForToken) {
  const user = userForToken || (await pool.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
  const { rawToken: newRefreshToken } = await tokenService.issueRefreshToken(userId, familyId);
  tokenService.setRefreshCookie(res, newRefreshToken);
  res.json({ token: tokenService.generateAccessToken(user) });
}

// POST /logout - revokes the refresh token server-side (not just clearing client
// state, which is all "logout" did before this existed) so it can't be used again even
// if it was copied off the device before logout. Works off the cookie alone, not an
// access token, so it still succeeds even if the access token already expired.
exports.logout = async (req, res) => {
  const rawToken = req.cookies?.[tokenService.REFRESH_COOKIE_NAME];
  if (rawToken) {
    const tokenRow = await tokenService.findRefreshTokenByHash(rawToken);
    if (tokenRow && !tokenRow.revoked_at) await tokenService.revokeRefreshToken(tokenRow.id);
  }
  tokenService.clearRefreshCookie(res);
  res.status(200).json({ message: 'Logged out' });
};
