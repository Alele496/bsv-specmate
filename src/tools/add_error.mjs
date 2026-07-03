import initSqlJs from 'sql.js';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { getDBPath, initDataDir } from '../config.mjs';
import { insertError } from '../db/schema.mjs';

export async function addError({ code, title, bsc_output, cause, solution, rules = '' }) {
    if (!code || !title || !bsc_output || !cause || !solution) {
        return '缺少必填字段: code, title, bsc_output, cause, solution';
    }

    const dbPath = getDBPath();

    if (!existsSync(dbPath)) {
        initDataDir();
        if (!existsSync(dbPath)) {
            mkdirSync(dirname(dbPath), { recursive: true });
            const SQL = await initSqlJs();
            const db = new SQL.Database();
            const { initDB } = await import('../db/schema.mjs');
            initDB(db);
            insertError(db, {
                code, title,
                keywords: `${code} ${title}`,
                phenomena: bsc_output,
                cause, solution, rules,
                count: 1
            });
            const data = db.export();
            const { writeFileSync } = await import('fs');
            writeFileSync(dbPath, Buffer.from(data));
            db.close();
            return `已追加 ${code}: ${title}`;
        }
    }

    const SQL = await initSqlJs();
    const buf = readFileSync(dbPath);
    const db = new SQL.Database(buf);

    const existing = db.prepare('SELECT code FROM errors WHERE code = ?');
    existing.bind([code]);
    const exists = existing.step();
    existing.free();

    if (exists) {
        db.run(
            `UPDATE errors SET title = ?, phenomena = ?, cause = ?, solution = ?, rules = ?, keywords = ? WHERE code = ?`,
            [title, bsc_output, cause, solution, rules, `${code} ${title}`, code]
        );
        db.close();
        return `已更新 ${code}: ${title}`;
    }

    insertError(db, {
        code, title,
        keywords: `${code} ${title}`,
        phenomena: bsc_output,
        cause, solution, rules,
        count: 1
    });

    const data = db.export();
    const { writeFileSync } = await import('fs');
    writeFileSync(dbPath, Buffer.from(data));
    db.close();

    return `已追加 ${code}: ${title}`;
}
