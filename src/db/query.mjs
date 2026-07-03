import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import initSqlJs from 'sql.js';
import { initDataDir, getDBPath } from '../config.mjs';
import { initDB, getError, getAllErrors, getTopRules, searchErrors, incrementCount } from './schema.mjs';

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

export function closeDB() {
    if (_db) {
        _db.close();
        _db = null;
    }
}
