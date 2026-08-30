const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../models/db');
require('dotenv').config();

function parseDurationToMs(duration) {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const value = Number(match[1]);
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return value * multipliers[match[2]];
}

const REFRESH_TOKEN_TTL_MS = parseDurationToMs(process.env.REFRESH_TOKEN_EXPIRES_IN || '7d');
const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/users'; // only the endpoints that need it ever see this cookie

// A reused (already-revoked) token presented within this window of its own revocation is
// treated as a legitimate concurrent retry (a network hiccup causing a duplicate refresh
// request), not theft - outside it, reuse is treated as a compromised token and the whole
// family is killed. Short on purpose: wide enough to absorb a real retry, narrow enough
// that it doesn't meaningfully help an attacker hide inside it.
const REUSE_GRACE_MS = 10 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

// Issues a new refresh token for a user and stores its hash - the raw value exists only
// for this one moment, only the hash is ever persisted. Omit familyId on a fresh login
// (starts a new family); pass the parent's familyId on rotation (continues it) - every
// token descended from one login shares the same family_id, which is what lets a single
// UPDATE revoke an entire lineage at once.
async function issueRefreshToken(userId, familyId = crypto.randomUUID()) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES ($1, $2, $3, $4)',
    [userId, hashToken(rawToken), familyId, expiresAt]
  );
  return { rawToken, familyId };
}

// Returns the row for a raw token regardless of its state (valid, revoked, or expired),
// or null if it never existed. Deliberately not filtered down to "valid only" - the
// caller needs to see revoked_at itself to tell an ordinary invalid token apart from
// reuse of one that was already rotated out, which is the whole point of tracking
// families in the first place.
async function findRefreshTokenByHash(rawToken) {
  const result = await pool.query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [hashToken(rawToken)]);
  return result.rows[0] || null;
}

// True if a just-detected reuse is recent enough to be a probable retry rather than theft.
// Not sufficient on its own, though - see familyHasValidToken.
function isWithinReuseGrace(tokenRow) {
  return Date.now() - new Date(tokenRow.revoked_at).getTime() <= REUSE_GRACE_MS;
}

// Distinguishes "this one token was revoked by a normal rotation, its sibling is still
// alive" from "this token's entire family was just killed by a theft-detection event".
// Both look identical from isWithinReuseGrace's perspective alone (a row revoked
// moments ago) - without this check, replaying ANY token from a family that was JUST
// mass-revoked would itself get forgiven as a "recent, probably-a-retry" reuse, which
// defeats the entire point of revoking the family in the first place.
async function familyHasValidToken(familyId) {
  const result = await pool.query(
    `SELECT 1 FROM refresh_tokens
     WHERE family_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [familyId]
  );
  return result.rows.length > 0;
}

async function revokeRefreshToken(id) {
  await pool.query('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
}

// The reuse-detection response: kill every token in the family, not just the one
// presented - the whole point is that a stolen token being replayed invalidates the
// legitimate user's current session too, forcing a real re-login instead of leaving the
// attacker's branch of the lineage alive.
async function revokeFamily(familyId) {
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE family_id = $1 AND revoked_at IS NULL',
    [familyId]
  );
}

// Used when an admin deactivates a user: kills every outstanding session immediately,
// not just future access-token checks (authMiddleware) - without this, a deactivated
// user's refresh token would sit there able to silently mint new access tokens the
// moment it's used, even though every one of those tokens would then fail the
// per-request is_active check anyway. Revoking here is the difference between "useless
// tokens nobody bothered to clean up" and "no outstanding session at all". Scoped to the
// user, not one family, since deactivation should end every session on every device.
async function revokeAllRefreshTokensForUser(userId) {
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: REFRESH_COOKIE_PATH,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

module.exports = {
  REFRESH_COOKIE_NAME,
  generateAccessToken,
  issueRefreshToken,
  findRefreshTokenByHash,
  isWithinReuseGrace,
  familyHasValidToken,
  revokeRefreshToken,
  revokeFamily,
  revokeAllRefreshTokensForUser,
  setRefreshCookie,
  clearRefreshCookie,
};
