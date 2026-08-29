const crypto = require('crypto');

// Generates a random password for admin/teacher-created accounts that don't specify one.
// 9 random bytes -> 12 base64url characters, ~72 bits of entropy - meant to be handed to
// the new user once by whoever created the account, not memorized long-term.
function generatePassword() {
  return crypto.randomBytes(9).toString('base64url');
}

module.exports = { generatePassword };
