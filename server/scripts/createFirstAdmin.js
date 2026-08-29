// One-time setup: creates the first admin account. Only runs if no admin already exists -
// after that, all account creation goes through the authenticated admin API, since public
// self-signup no longer exists for any role.
//
// Usage: node scripts/createFirstAdmin.js "Full Name" "email@example.com" "password"
const bcrypt = require('bcrypt');
const pool = require('../models/db');

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password) {
    console.error('Usage: node scripts/createFirstAdmin.js "Full Name" "email@example.com" "password"');
    process.exitCode = 1;
    return;
  }

  const existing = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
  if (Number(existing.rows[0].count) > 0) {
    console.error('An admin account already exists. Use the admin API (POST /api/users) to create additional accounts.');
    process.exitCode = 1;
    return;
  }

  const password_hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id, name, email",
    [name, email, password_hash]
  );
  console.log('Created first admin:', result.rows[0]);
}

main()
  .catch((err) => {
    console.error('Failed to create first admin:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
