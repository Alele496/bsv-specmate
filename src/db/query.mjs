import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '..', 'data', 'knowledge.db');

import { initDB, getError, getAllErrors, searchErrors, incrementCount } from './schema.mjs';

let _db = null;

async function getDB() {
    if (_db) return _db;
    const SQL = await initSqlJs();
    if (existsSync(DB_PATH)) {
        const buf = readFileSync(DB_PATH);
        _db = new SQL.Database(buf);
    } else {
        if (!existsSync(dirname(DB_PATH))) {
            mkdirSync(dirname(DB_PATH), { recursive: true });
        }
        _db = new SQL.Database();
        initDB(_db);
    }
    return _db;
}

export async function queryError(code) {
    const db = await getDB();
    return getError(db, code);
}

export async function queryAllErrors() {
    const db = await getDB();
    return getAllErrors(db);
}

export async function querySearch(keyword) {
    const db = await getDB();
    return searchErrors(db, keyword);
}

export async function hitError(code) {
    const db = await getDB();
    incrementCount(db, code);
    const data = db.export();
    const { writeFileSync } = await import('fs');
    writeFileSync(DB_PATH, Buffer.from(data));
}

export function closeDB() {
    if (_db) {
        _db.close();
        _db = null;
    }
}
