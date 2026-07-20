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
    count       INTEGER DEFAULT 1,
    severity    TEXT DEFAULT 'compile',
    source      TEXT DEFAULT 'specmate'
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
    error_token TEXT,
    repeat_count INTEGER DEFAULT 1,
    cause       TEXT,
    solution    TEXT,
    status      TEXT DEFAULT 'unresolved',
    review_status TEXT DEFAULT 'unreviewed',
    reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_captures_dedup ON captures(code, file, session_id);
CREATE INDEX IF NOT EXISTS idx_captures_token ON captures(error_token, code);

CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    task_name       TEXT,
    started_at      TEXT NOT NULL,
    ended_at        TEXT,
    compile_attempts INTEGER DEFAULT 0,
    compile_failures INTEGER DEFAULT 0,
    phase           TEXT DEFAULT NULL
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
    error_token TEXT,
    repeat_count INTEGER DEFAULT 1,
    cause       TEXT,
    solution    TEXT,
    status      TEXT DEFAULT 'unresolved',
    review_status TEXT DEFAULT 'unreviewed',
    reviewed_at TEXT
)`;

export function initDB(db) {
    db.run(SCHEMA);
}
