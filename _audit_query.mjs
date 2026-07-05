import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

const SQL = await initSqlJs();
const buf = readFileSync('data/knowledge.db');
const db = new SQL.Database(buf);

console.log('=== ERRORS ===');
const stmt = db.prepare('SELECT code, title, keywords, count FROM errors ORDER BY count DESC');
while (stmt.step()) {
  const r = stmt.getAsObject();
  console.log(JSON.stringify(r));
}
stmt.free();

console.log('=== REF_HITS ===');
const stmt2 = db.prepare('SELECT topic, count FROM ref_hits ORDER BY count DESC');
while (stmt2.step()) {
  console.log(JSON.stringify(stmt2.getAsObject()));
}
stmt2.free();

db.close();
