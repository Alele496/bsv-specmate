const SCHEMA = `
CREATE TABLE IF NOT EXISTS errors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    keywords    TEXT NOT NULL,
    phenomena   TEXT NOT NULL,
    cause       TEXT NOT NULL,
    solution    TEXT NOT NULL,
    rules       TEXT,
    count       INTEGER DEFAULT 1
);
`;

export function initDB(db) {
    db.run(SCHEMA);
}

export function insertError(db, { code, title, keywords, phenomena, cause, solution, rules = '', count = 1 }) {
    db.run(
        `INSERT OR REPLACE INTO errors (code, title, keywords, phenomena, cause, solution, rules, count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, title, keywords, phenomena, cause, solution, rules, count]
    );
}

export function getError(db, code) {
    const stmt = db.prepare('SELECT * FROM errors WHERE code = ?');
    stmt.bind([code]);
    let row = null;
    if (stmt.step()) {
        row = stmt.getAsObject();
    }
    stmt.free();
    return row && row.code ? row : null;
}

export function getAllErrors(db) {
    const results = [];
    const stmt = db.prepare('SELECT code, title, keywords, count FROM errors ORDER BY count DESC');
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function searchErrors(db, keyword) {
    const results = [];
    const stmt = db.prepare(
        `SELECT code, title, keywords FROM errors
         WHERE keywords LIKE ? OR title LIKE ? OR code LIKE ?
         LIMIT 5`
    );
    const kw = `%${keyword}%`;
    stmt.bind([kw, kw, kw]);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function incrementCount(db, code) {
    db.run('UPDATE errors SET count = count + 1 WHERE code = ?', [code]);
}
