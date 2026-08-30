const { Pool, types } = require('pg');
require('dotenv').config();

// pg's default parser for "timestamp without time zone" (OID 1114) interprets the raw
// string in the NODE PROCESS's local timezone - but every value in this schema is
// written by Postgres using ITS OWN session timezone (UTC here, confirmed via
// current_setting('TIMEZONE')), not the app server's local zone. Left uncorrected, any
// JS-side arithmetic on a value read back from the DB (e.g. "how many ms since this row
// was revoked") is silently wrong by exactly the local/UTC offset. Every other timestamp
// comparison in this app happens SQL-side (e.g. WHERE expires_at > CURRENT_TIMESTAMP),
// which never round-trips through JS and so never hit this - the refresh-token grace
// window is the first code path that does, which is how this got found.
types.setTypeParser(1114, (value) => new Date(`${value.replace(' ', 'T')}Z`));

const pool = new Pool({
    user: process.env.USER,
    host: process.env.HOST,
    database: process.env.DATABASE,
    password: process.env.PASSWORD,
    port: process.env.PORT
  });

module.exports = pool;
