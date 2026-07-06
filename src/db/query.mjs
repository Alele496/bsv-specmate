import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import initSqlJs from 'sql.js';
import { initDataDir, getDBPath } from '../config.mjs';
import { initDB, getError, getAllErrors, getTopRules, searchErrors, incrementCount, getHotTopics, incrementRefHit, insertCapture, resolveCapture, getCapturesByCode, getRecentCaptures, getUnresolvedCaptures, getLatestUnresolvedByCode } from './schema.mjs';

let _db = null;
let _dbPath = null;

async function ensureDB() {
    if (_db) return _db;

    const { created } = initDataDir();
    _dbPath = getDBPath();
    const SQL = await initSqlJs();

    if (existsSync(_dbPath)) {
        const buf = readFileSync(_dbPath);
        _db = new SQL.Database(buf);
        // Ensure new tables exist (migration for existing DBs)
        _db.run(`CREATE TABLE IF NOT EXISTS captures (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            code        TEXT NOT NULL,
            timestamp   TEXT NOT NULL,
            bsc_output  TEXT NOT NULL,
            files       TEXT,
            cause       TEXT,
            solution    TEXT,
            status      TEXT DEFAULT 'unresolved'
        )`);
    } else {
        if (!existsSync(dirname(_dbPath))) {
            mkdirSync(dirname(_dbPath), { recursive: true });
        }
        _db = new SQL.Database();
        initDB(_db);
    }
    return _db;
}

async function saveDB() {
    if (!_db || !_dbPath) return;
    const data = _db.export();
    const { writeFileSync } = await import('fs');
    writeFileSync(_dbPath, Buffer.from(data));
}

export async function queryError(code) {
    const db = await ensureDB();
    return getError(db, code);
}

export async function queryAllErrors() {
    const db = await ensureDB();
    return getAllErrors(db);
}

export async function querySearch(keyword) {
    const db = await ensureDB();
    return searchErrors(db, keyword);
}

export async function hitError(code) {
    const db = await ensureDB();
    incrementCount(db, code);
    await saveDB();
}

export async function queryTopRules(limit) {
    const db = await ensureDB();
    return getTopRules(db, limit);
}

export async function queryHotTopics(limit = 5) {
    const db = await ensureDB();
    return getHotTopics(db, limit);
}

export async function trackRefHit(topic) {
    const db = await ensureDB();
    incrementRefHit(db, topic);
    await saveDB();
}

export async function addCapture({ code, bsc_output, files }) {
    const db = await ensureDB();
    const timestamp = new Date().toISOString();
    insertCapture(db, { code, timestamp, bsc_output, files });
    await saveDB();
}

export async function resolveCaptureById(id, { cause, solution }) {
    const db = await ensureDB();
    resolveCapture(db, id, { cause, solution });
    await saveDB();
}

export async function queryCapturesByCode(code, limit = 5) {
    const db = await ensureDB();
    return getCapturesByCode(db, code, limit);
}

export async function queryRecentCaptures(limit = 10) {
    const db = await ensureDB();
    return getRecentCaptures(db, limit);
}

export async function queryUnresolvedCaptures() {
    const db = await ensureDB();
    return getUnresolvedCaptures(db);
}

export async function getLatestCaptureByCode(code) {
    const db = await ensureDB();
    return getLatestUnresolvedByCode(db, code);
}

export function closeDB() {
    if (_db) {
        _db.close();
        _db = null;
    }
}
