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

CREATE TABLE IF NOT EXISTS ref_hits (
    topic       TEXT PRIMARY KEY,
    count       INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS captures (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL,
    timestamp   TEXT NOT NULL,
    bsc_output  TEXT NOT NULL,
    files       TEXT,
    cause       TEXT,
    solution    TEXT,
    status      TEXT DEFAULT 'unresolved'
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

export function incrementRefHit(db, topic) {
    db.run(
        `INSERT INTO ref_hits (topic, count) VALUES (?, 1)
         ON CONFLICT(topic) DO UPDATE SET count = count + 1`,
        [topic]
    );
}

export function getHotTopics(db, limit = 5) {
    const results = [];
    const stmt = db.prepare('SELECT topic, count FROM ref_hits ORDER BY count DESC LIMIT ?');
    stmt.bind([limit]);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
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

export function getTopRules(db, limit) {
    const results = [];
    const stmt = db.prepare(
        'SELECT code, title, count, rules FROM errors WHERE rules IS NOT NULL AND rules != "" ORDER BY count DESC LIMIT ?'
    );
    stmt.bind([limit]);
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

export function insertCapture(db, { code, timestamp, bsc_output, files, status = 'unresolved' }) {
    db.run(
        `INSERT INTO captures (code, timestamp, bsc_output, files, status)
         VALUES (?, ?, ?, ?, ?)`,
        [code, timestamp, bsc_output, files || null, status]
    );
}

export function resolveCapture(db, id, { cause, solution }) {
    db.run(
        `UPDATE captures SET cause = ?, solution = ?, status = 'resolved' WHERE id = ?`,
        [cause, solution, id]
    );
}

export function getCapturesByCode(db, code, limit = 5) {
    const results = [];
    const stmt = db.prepare(
        'SELECT * FROM captures WHERE code = ? ORDER BY id DESC LIMIT ?'
    );
    stmt.bind([code, limit]);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

export function getRecentCaptures(db, limit = 10) {
    const results = [];
    const stmt = db.prepare(
        'SELECT * FROM captures ORDER BY id DESC LIMIT ?'
    );
    stmt.bind([limit]);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

export function getUnresolvedCaptures(db) {
    const results = [];
    const stmt = db.prepare(
        "SELECT * FROM captures WHERE status = 'unresolved' ORDER BY id DESC"
    );
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

export function getLatestUnresolvedByCode(db, code) {
    const stmt = db.prepare(
        "SELECT * FROM captures WHERE code = ? AND status = 'unresolved' ORDER BY id DESC LIMIT 1"
    );
    stmt.bind([code]);
    let row = null;
    if (stmt.step()) row = stmt.getAsObject();
    stmt.free();
    return row;
}
