import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import { initDB, insertError } from './schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const ERRORS_DIR = join(PROJECT_ROOT, 'docs', 'errors');
const DB_DIR = join(PROJECT_ROOT, 'data');
const DB_PATH = join(DB_DIR, 'knowledge.db');

function parseErrorFile(content) {
    const lines = content.split('\n');

    let code = '';
    let title = '';
    let keywords = '';
    let phenomena = '';
    let cause = '';
    let solution = '';
    let rules = '';
    let count = 1;

    const firstLine = lines[0] || '';
    const match = firstLine.match(/^#\s+(\S+)\s*[—-]\s*(.+?)\s*\(×(\d+)\)/);
    if (match) {
        code = match[1].trim();
        title = match[2].trim();
        count = parseInt(match[3], 10);
    }

    let section = '';
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^\*\*(?:bsc\s*输出|现象)\*\*/.test(line)) {
            section = 'phenomena';
            continue;
        }
        if (/^\*\*原因\*\*/.test(line)) {
            section = 'cause';
            continue;
        }
        if (/^\*\*解决\*\*/.test(line)) {
            section = 'solution';
            continue;
        }
        if (line.startsWith('> **规则**:')) {
            rules += line.replace(/^>\s*\*\*规则\*\*:\s*/, '').trim();
            rules += '\n';
            continue;
        }
        if (line.startsWith('> ') && section === 'rules') {
            rules += line.replace(/^>\s*/, '');
            continue;
        }

        if (section === 'phenomena') {
            phenomena += line + '\n';
        } else if (section === 'cause') {
            if (!line.startsWith('#') && line.trim()) {
                cause += line + '\n';
            }
        } else if (section === 'solution') {
            if (!line.startsWith('#') && !line.startsWith('> **规则')) {
                solution += line + '\n';
            }
        }
    }

    phenomena = phenomena.trim();
    cause = cause.trim();
    solution = solution.trim();
    rules = rules.trim();
    keywords = [code, title].filter(Boolean).join(' ');

    return { code, title, keywords, phenomena, cause, solution, rules, count };
}

async function main() {
    const SQL = await initSqlJs();

    let db;
    if (existsSync(DB_PATH)) {
        const buf = readFileSync(DB_PATH);
        db = new SQL.Database(buf);
        db.run('DROP TABLE IF EXISTS errors');
    } else {
        if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
        db = new SQL.Database();
    }

    initDB(db);

    const errorFiles = readdirSync(ERRORS_DIR)
        .filter(f => f.endsWith('.md') && f !== 'INDEX.md')
        .sort();

    let inserted = 0;
    for (const file of errorFiles) {
        const content = readFileSync(join(ERRORS_DIR, file), 'utf-8');
        const err = parseErrorFile(content);
        if (err.code) {
            insertError(db, err);
            console.log(`  + ${err.code}: ${err.title}`);
            inserted++;
        } else {
            console.log(`  - ${file}: skipped (parse failed)`);
        }
    }

    const data = db.export();
    const buf = Buffer.from(data);
    const { writeFileSync } = await import('fs');
    writeFileSync(DB_PATH, buf);
    console.log(`\n${inserted}/${errorFiles.length} errors written to ${DB_PATH}`);
    db.close();
}

main().catch(console.error);
