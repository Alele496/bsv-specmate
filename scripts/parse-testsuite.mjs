import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const TESTSUITE = process.argv[2] || 'D:/Desktop/bsc/testsuite';
const OUT = process.argv[3] || join(process.cwd(), 'data', 'testsuite-errors.json');

function walk(dir) {
    const entries = [];
    try {
        for (const e of readdirSync(dir)) {
            const p = join(dir, e);
            try {
                if (statSync(p).isDirectory()) {
                    entries.push(...walk(p));
                } else if (e.endsWith('.exp')) {
                    entries.push(p);
                }
            } catch (_) {}
        }
    } catch (_) {}
    return entries;
}

function parseExp(filepath) {
    const content = readFileSync(filepath, 'utf-8');
    const dir = filepath.replace(/[/\\][^/\\]+\.exp$/, '');

    const results = [];

    const failPatterns = [
        { re: /compile_fail_error\s+(\S+)\s+(\S+)/g, field: 'code' },
        { re: /compile_fail_error_bug\s+(\S+)\s+(\S+)/g, field: 'code_bug' },
        { re: /compile_verilog_fail_error\s+(\S+)\s+(\S+)/g, field: 'code_v' },
        { re: /compile_object_fail_error\s+(\S+)\s+(\S+)/g, field: 'code_o' },
        { re: /compile_fail\s+(\S+)/g, field: 'fail_no_code' },
        { re: /compile_verilog_fail\s+(\S+)/g, field: 'fail_v_no_code' },
    ];

    for (const { re, field } of failPatterns) {
        let m;
        while ((m = re.exec(content)) !== null) {
            const srcFile = m[1].replace(/\$/g, '');
            const entry = {
                file: srcFile,
                dir: dir,
                exp: filepath,
                tag: field,
            };
            if (m[2]) entry.code = m[2];
            results.push(entry);
        }
    }

    return results;
}

function main() {
    const expFiles = walk(TESTSUITE);
    console.log(`Found ${expFiles.length} .exp files`);

    const all = [];
    for (const f of expFiles) {
        const entries = parseExp(f);
        all.push(...entries);
    }

    const byCode = {};
    for (const e of all) {
        const code = e.code || '(no code)';
        if (!byCode[code]) byCode[code] = [];
        byCode[code].push(e);
    }

    const summary = {};
    for (const [code, entries] of Object.entries(byCode)) {
        summary[code] = { count: entries.length, examples: entries.slice(0, 5).map(e => join(e.dir, e.file)) };
    }

    writeFileSync(OUT, JSON.stringify({ total: all.length, summary, entries: all }, null, 2), 'utf-8');
    console.log(`\nExtracted ${all.length} error annotations across ${Object.keys(byCode).length} error codes`);
    console.log(`Output: ${OUT}`);

    const top = Object.entries(summary)
        .filter(([c]) => c !== '(no code)')
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 15);

    console.log('\nTop 15 error codes:');
    for (const [code, info] of top) {
        console.log(`  ${code}: ${info.count}`);
    }
}

main();
