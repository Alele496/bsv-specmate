import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import { initDB, insertError } from './schema.mjs';
import { getDBPath, initDataDir } from '../config.mjs';
import { collectErrorFiles, parseErrorFile } from './parser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = getDBPath();

async function main() {
    initDataDir();
    const SQL = await initSqlJs();

    let db;
    if (existsSync(DB_PATH)) {
        const buf = readFileSync(DB_PATH);
        db = new SQL.Database(buf);
    } else {
        mkdirSync(dirname(DB_PATH), { recursive: true });
        db = new SQL.Database();
    }

    initDB(db);

    const errorPaths = collectErrorFiles();

    if (errorPaths.length === 0) {
        console.log('No error files found in user dir or package dir.');
        db.close();
        return;
    }

    let inserted = 0;
    for (const filePath of errorPaths.sort()) {
        const content = readFileSync(filePath, 'utf-8');
        const err = parseErrorFile(content);
        if (err.code) {
            insertError(db, err);
            console.log(`  + ${err.code}: ${err.title}`);
            inserted++;
        } else {
            console.log(`  - ${filePath}: skipped (parse failed)`);
        }
    }

    const data = db.export();
    const buf = Buffer.from(data);
    writeFileSync(DB_PATH, buf);
    console.log(`\n${inserted}/${errorPaths.length} errors written to ${DB_PATH}`);
    db.close();
}

main().catch(console.error);
