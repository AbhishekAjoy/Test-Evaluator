// One-time setup: creates the first admin account. Only runs if no admin already exists -
// after that, all account creation goes through the authenticated admin API, since public
// self-signup no longer exists for any role.
//
// Usage: node scripts/createFirstAdmin.js "Full Name" "email@example.com"
// The password is prompted for interactively (input hidden) rather than taken as an
// argument - CLI arguments are visible to other processes on the same machine and
// commonly end up in shell history.
const bcrypt = require('bcrypt');
const pool = require('../models/db');

// Control chars are compared by numeric code, not string literal, to avoid embedding
// raw control bytes in the source file: newline=10/13, Ctrl-C=3, Ctrl-D=4, backspace=8/127.
const CODE_CTRL_C = 3;
const CODE_CTRL_D = 4;
const CODE_BACKSPACE_1 = 8;
const CODE_BACKSPACE_2 = 127;

function promptHiddenPassword(query) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('Requires an interactive terminal - run this script directly, not piped or scripted.'));
      return;
    }

    process.stdout.write(query);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');

    let input = '';
    const onData = (char) => {
      const code = char.charCodeAt(0);

      if (char === '\n' || char === '\r' || code === CODE_CTRL_D) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
        return;
      }
      if (code === CODE_CTRL_C) {
        process.stdout.write('\n');
        process.exit(1);
      }
      if (code === CODE_BACKSPACE_1 || code === CODE_BACKSPACE_2) {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }

      input += char;
      process.stdout.write('*');
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const [name, email] = process.argv.slice(2);
  if (!name || !email) {
    console.error('Usage: node scripts/createFirstAdmin.js "Full Name" "email@example.com"');
    process.exitCode = 1;
    return;
  }

  const existing = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
  if (Number(existing.rows[0].count) > 0) {
    console.error('An admin account already exists. Use the admin API (POST /api/users) to create additional accounts.');
    process.exitCode = 1;
    return;
  }

  const password = await promptHiddenPassword('Password for the first admin: ');
  if (!password) {
    console.error('Password cannot be empty.');
    process.exitCode = 1;
    return;
  }
  const confirmPassword = await promptHiddenPassword('Confirm password: ');
  if (password !== confirmPassword) {
    console.error('Passwords did not match.');
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
