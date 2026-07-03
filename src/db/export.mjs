import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import initSqlJs from 'sql.js';
import { getDBPath, getUserErrorsDir, initDataDir } from '../config.mjs';

async function main() {
    const dbPath = getDBPath();

    if (!existsSync(dbPath)) {
        console.log(`数据库不存在: ${dbPath}`);
        console.log('请先运行 MCP Server 完成初始化，或运行 db:seed');
        return;
    }

    const SQL = await initSqlJs();
    const buf = readFileSync(dbPath);
    const db = new SQL.Database(buf);

    const stmt = db.prepare('SELECT * FROM errors ORDER BY count DESC');
    const errors = [];
    while (stmt.step()) {
        errors.push(stmt.getAsObject());
    }
    stmt.free();
    db.close();

    const outDir = getUserErrorsDir();
    mkdirSync(outDir, { recursive: true });

    for (const e of errors) {
        const lines = [];
        lines.push(`# ${e.code} — ${e.title} (×${e.count})\n`);

        if (e.phenomena) {
            lines.push(`**bsc 输出**：`);
            lines.push('');
            lines.push(e.phenomena.trim());
            lines.push('');
        }

        if (e.cause) {
            lines.push(`**原因**：${e.cause.trim()}\n`);
        }

        if (e.solution) {
            lines.push(`**解决**：${e.solution.trim()}\n`);
        }

        if (e.rules) {
            lines.push(`> **规则**: ${e.rules.trim()}\n`);
        }

        const filename = `${e.code}.md`;
        writeFileSync(join(outDir, filename), lines.join('\n'), 'utf-8');
        console.log(`  ✓ ${filename}`);
    }

    console.log(`\n导出完成: ${errors.length} 条 → ${outDir}`);
}

main().catch(console.error);
