const fs = require('fs');
const { Client } = require('pg');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node db/run.js db/yourfile.sql');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Set it first (see instructions).');
  process.exit(1);
}

const sql = fs.readFileSync(file, 'utf8');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();
  const res = await client.query(sql);
  const results = Array.isArray(res) ? res : [res];
  for (const r of results) {
    if (r.rows && r.rows.length > 0) console.table(r.rows);
  }
  console.log('✅ Success');
  await client.end();
})().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});