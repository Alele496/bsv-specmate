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
    file        TEXT,
    source      TEXT DEFAULT 'bsc',
    session_id  TEXT,
    repeat_count INTEGER DEFAULT 1,
    cause       TEXT,
    solution    TEXT,
    status      TEXT DEFAULT 'unresolved'
);

CREATE INDEX IF NOT EXISTS idx_captures_dedup ON captures(code, file, session_id);

CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    task_name       TEXT,
    started_at      TEXT NOT NULL,
    ended_at        TEXT,
    compile_attempts INTEGER DEFAULT 0,
    compile_failures INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS warnings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id TEXT NOT NULL,
    timestamp   TEXT NOT NULL,
    file        TEXT NOT NULL,
    line        INTEGER,
    code        TEXT NOT NULL,
    message     TEXT NOT NULL,
    UNIQUE(snapshot_id, file, line, code)
);
`;

// Captures table DDL, also used by ensureDB() migration path in query.mjs.
// Keep in sync with the captures entry in SCHEMA above.
export const CAPTURES_DDL = `CREATE TABLE IF NOT EXISTS captures (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL,
    timestamp   TEXT NOT NULL,
    bsc_output  TEXT NOT NULL,
    files       TEXT,
    file        TEXT,
    source      TEXT DEFAULT 'bsc',
    session_id  TEXT,
    repeat_count INTEGER DEFAULT 1,
    cause       TEXT,
    solution    TEXT,
    status      TEXT DEFAULT 'unresolved'
)`;

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

/**
 * Upsert a capture record. If a capture with the same (code, file, session_id)
 * already exists with status='unresolved', increment its repeat_count instead of
 * inserting a new row.
 * @returns {{ id: number, deduped: boolean, repeat_count: number }}
 */
export function upsertCapture(db, { code, timestamp, bsc_output, files, status = 'unresolved', file = null, source = 'bsc', session_id = null }) {
    // Check for existing unresolved capture with same dedup key
    const stmt = db.prepare(
        `SELECT id, repeat_count FROM captures
         WHERE code = ? AND file IS ? AND session_id IS ? AND status = 'unresolved'
         LIMIT 1`
    );
    stmt.bind([code, file, session_id]);
    let existing = null;
    if (stmt.step()) existing = stmt.getAsObject();
    stmt.free();

    if (existing) {
        // Dedup: increment repeat_count on the existing row
        const newCount = existing.repeat_count + 1;
        db.run('UPDATE captures SET repeat_count = ? WHERE id = ?', [newCount, existing.id]);
        return { id: existing.id, deduped: true, repeat_count: newCount };
    }

    // New capture
    db.run(
        `INSERT INTO captures (code, timestamp, bsc_output, files, file, source, session_id, status, repeat_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [code, timestamp, bsc_output, files || null, file, source, session_id, status]
    );
    const result = db.exec('SELECT last_insert_rowid()');
    const id = result[0].values[0][0];
    return { id, deduped: false, repeat_count: 1 };
}

export function createSession(db, { id, task_name = null, started_at }) {
    db.run(
        `INSERT OR REPLACE INTO sessions (id, task_name, started_at)
         VALUES (?, ?, ?)`,
        [id, task_name, started_at]
    );
}

export function endSession(db, id) {
    db.run(
        `UPDATE sessions SET ended_at = ? WHERE id = ?`,
        [new Date().toISOString(), id]
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

export function insertWarning(db, { snapshot_id, timestamp, file, line, code, message }) {
    db.run(
        `INSERT OR IGNORE INTO warnings (snapshot_id, timestamp, file, line, code, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [snapshot_id, timestamp, file, line, code, message]
    );
}

export function getWarningsBySnapshot(db, snapshot_id) {
    const results = [];
    const stmt = db.prepare(
        'SELECT * FROM warnings WHERE snapshot_id = ? ORDER BY file, line'
    );
    stmt.bind([snapshot_id]);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

export function getLatestSnapshots(db, limit = 2) {
    const results = [];
    const stmt = db.prepare(
        'SELECT DISTINCT snapshot_id, MIN(timestamp) as timestamp FROM warnings GROUP BY snapshot_id ORDER BY timestamp DESC LIMIT ?'
    );
    stmt.bind([limit]);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

// ── P1 statistics: session-level aggregation queries ──

/**
 * Get session-level statistics: compile attempts (distinct capture count) and unresolved error count.
 * @param {object} db - SQL.js database handle
 * @param {string} sessionId
 * @returns {{ compileAttempts: number, unresolvedCount: number }}
 */
export function getSessionStats(db, sessionId) {
    const stmt = db.prepare(
        `SELECT
            COUNT(*) as compile_attempts,
            SUM(CASE WHEN status = 'unresolved' THEN 1 ELSE 0 END) as unresolved_count
         FROM captures WHERE session_id = ?`
    );
    stmt.bind([sessionId]);
    let row = { compileAttempts: 0, unresolvedCount: 0 };
    if (stmt.step()) {
        const obj = stmt.getAsObject();
        row = { compileAttempts: obj.compile_attempts || 0, unresolvedCount: obj.unresolved_count || 0 };
    }
    stmt.free();
    return row;
}

/**
 * Get stubborn errors: capture entries whose repeat_count >= minCount within the given session.
 * These are error codes that keep reappearing despite Agent's fix attempts.
 * @param {object} db
 * @param {string} sessionId
 * @param {number} minCount - minimum repeat_count to qualify as stubborn (default 2)
 * @returns {Array<{ code: string, file: string, repeat_count: number }>}
 */
export function getStubbornErrors(db, sessionId, minCount = 2) {
    const results = [];
    const stmt = db.prepare(
        `SELECT code, file, MAX(repeat_count) as repeat_count
         FROM captures
         WHERE session_id = ? AND repeat_count >= ?
         GROUP BY code, file
         ORDER BY repeat_count DESC`
    );
    stmt.bind([sessionId, minCount]);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Get fix rate for a session: how many captures have been resolved vs total.
 * @param {object} db
 * @param {string} sessionId
 * @returns {{ resolved: number, total: number }}
 */
export function getFixRate(db, sessionId) {
    const stmt = db.prepare(
        `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
         FROM captures WHERE session_id = ?`
    );
    stmt.bind([sessionId]);
    let row = { resolved: 0, total: 0 };
    if (stmt.step()) {
        const obj = stmt.getAsObject();
        row = { resolved: obj.resolved || 0, total: obj.total || 0 };
    }
    stmt.free();
    return row;
}
