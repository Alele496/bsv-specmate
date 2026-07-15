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

    // === 自动化护栏：全量解析验证（在写入 DB 之前） ===
    // 任何 .md 文件解析失败 → 立即退出，不进 DB
    // 防止格式不兼容的文档被静默跳过（parser 格式兼容性 bug 教训）
    let parseErrors = [];
    for (const filePath of errorPaths.sort()) {
        const content = readFileSync(filePath, 'utf-8');
        const err = parseErrorFile(content);
        if (!err.code) {
            parseErrors.push(filePath);
        }
    }
    if (parseErrors.length > 0) {
        console.error(`\n❌ 护栏拦截：${parseErrors.length} 个文件解析失败（缺少 code 字段）:`);
        for (const f of parseErrors) console.error(`   - ${f}`);
        console.error('\n请检查文档格式是否兼容 parser.mjs 的正则表达式。');
        console.error('支持的格式：**现象**/**原因**/**解决** 或 ## 现象/## 原因/## 解决方案');
        db.close();
        process.exit(1);
    }
    console.log(`✅ 护栏通过：${errorPaths.length} 个文件全部可解析\n`);
    // === 护栏结束 ===

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
