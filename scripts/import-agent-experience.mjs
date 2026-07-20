/**
 * Agent 经验自动导入（CLI 工具）
 *
 * 用法：
 *   node scripts/import-agent-experience.mjs <markdown-file-path>
 *   cat experience.md | node scripts/import-agent-experience.mjs --stdin
 *
 * 模板格式（YAML frontmatter + Markdown 正文）：
 *   ---
 *   code: T0033
 *   title: zeroExtend() 宽度推断歧义
 *   severity: compile
 *   keywords: [zeroExtend, 宽度推断]
 *   source: agent
 *   bsc_versions: ['2025.07']
 *   ---
 *   ## 现象
 *   ...
 *   ## 原因
 *   ...
 *   ## 解决
 *   ...
 *   ## 为什么是陷阱
 *   ...
 *
 * 一个文件可包含多条经验，用 --- 分隔。
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import { initDB, getError, upsertError } from '../src/db/schema.mjs';
import { getDBPath, initDataDir } from '../src/config.mjs';

// ── YAML frontmatter 解析（零外部依赖，简单行解析） ──

/**
 * 解析 YAML frontmatter 文本块
 * 支持简单 key: value 和 key: [item, item] 数组格式
 */
function parseFrontmatter(text) {
    const result = {};
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const key = line.slice(0, colonIdx).trim();
        let value = line.slice(colonIdx + 1).trim();

        // 空值
        if (value === '' || value === 'null' || value === '~') {
            result[key] = null;
            continue;
        }

        // 数组：[a, b, c] 或 ['a', 'b']
        if (value.startsWith('[') && value.endsWith(']')) {
            const inner = value.slice(1, -1).trim();
            if (inner === '') {
                result[key] = [];
            } else {
                result[key] = inner
                    .split(',')
                    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
                    .filter(s => s.length > 0);
            }
            continue;
        }

        // 引号字符串
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
        }

        result[key] = value;
    }
    return result;
}

// ── Markdown 正文解析 ──

/**
 * 从 Markdown 正文中提取结构化字段
 * 支持 ## 现象 / ## 原因 / ## 解决 / ## 为什么是陷阱
 */
function parseBody(text) {
    const result = { phenomena: '', cause: '', solution: '' };

    // 按 ## 标题切分
    const sections = {};
    const headingRegex = /^##\s+(.+)$/gm;
    const matches = [];
    let match;
    while ((match = headingRegex.exec(text)) !== null) {
        matches.push({ title: match[1].trim(), index: match.index, endIndex: headingRegex.lastIndex });
    }

    for (let i = 0; i < matches.length; i++) {
        const start = matches[i].endIndex;
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        sections[matches[i].title] = text.slice(start, end).trim();
    }

    // 映射到标准字段
    const sectionMap = {
        '现象': 'phenomena',
        '原因': 'cause',
        '解决': 'solution',
        '解决方案': 'solution',
        '为什么是陷阱': 'trap_why',
    };

    for (const [heading, content] of Object.entries(sections)) {
        const field = sectionMap[heading];
        if (!field) continue;
        if (field === 'trap_why') {
            // "为什么是陷阱" 追加到 cause
            result.cause = (result.cause + '\n\n[陷阱]\n' + content).trim();
        } else {
            result[field] = content;
        }
    }

    // 如果没有用 ## 标题分割成功，尝试按 **粗体** 标签分割（兼容旧格式）
    if (!result.phenomena && !result.cause && !result.solution) {
        const boldRegex = /\*\*(现象|原因|解决|解决方案|为什么是陷阱)\*\*[：:]/g;
        const boldMatches = [];
        let bm;
        while ((bm = boldRegex.exec(text)) !== null) {
            boldMatches.push({ title: bm[1].trim(), index: bm.index, endIndex: boldRegex.lastIndex });
        }
        for (let i = 0; i < boldMatches.length; i++) {
            const start = boldMatches[i].endIndex;
            const end = i + 1 < boldMatches.length ? boldMatches[i + 1].index : text.length;
            const heading = boldMatches[i].title;
            const field = sectionMap[heading];
            if (!field) continue;
            const content = text.slice(start, end).trim();
            if (field === 'trap_why') {
                result.cause = (result.cause + '\n\n[陷阱]\n' + content).trim();
            } else {
                result[field] = content;
            }
        }
    }

    return result;
}

// ── Markdown 完整条目解析 ──

/**
 * 解析完整 Markdown 文件，返回经验条目数组
 * 多条经验用 --- 分隔（每条经验以 --- 开始的 YAML frontmatter 为界）
 */
function parseMarkdown(content) {
    const entries = [];
    const lines = content.split('\n');

    let state = 'idle'; // idle → frontmatter → body → idle
    let frontmatterLines = [];
    let bodyLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim() === '---') {
            if (state === 'idle') {
                // 开始 frontmatter
                state = 'frontmatter';
                frontmatterLines = [];
            } else if (state === 'frontmatter') {
                // 结束 frontmatter，开始 body
                state = 'body';
                bodyLines = [];
            } else if (state === 'body') {
                // 结束当前条目，保存，并开始下一个 frontmatter
                const frontmatter = parseFrontmatter(frontmatterLines.join('\n'));
                const body = parseBody(bodyLines.join('\n'));
                entries.push(buildEntry(frontmatter, body));

                state = 'frontmatter';
                frontmatterLines = [];
            }
        } else {
            if (state === 'frontmatter') {
                frontmatterLines.push(line);
            } else if (state === 'body') {
                bodyLines.push(line);
            }
            // idle state: skip lines before first ---
        }
    }

    // 最后一个条目的 body 没有后续 --- 来触发保存
    if (state === 'body' && frontmatterLines.length > 0) {
        const frontmatter = parseFrontmatter(frontmatterLines.join('\n'));
        const body = parseBody(bodyLines.join('\n'));
        entries.push(buildEntry(frontmatter, body));
    } else if (state === 'frontmatter' && frontmatterLines.length > 0) {
        // 只有 frontmatter，没有 body（边界情况）
        const frontmatter = parseFrontmatter(frontmatterLines.join('\n'));
        entries.push(buildEntry(frontmatter, { phenomena: '', cause: '', solution: '' }));
    }

    return entries;
}

/**
 * 从前端元数据和正文构建标准 entry 对象
 */
function buildEntry(frontmatter, body) {
    return {
        code: frontmatter.code || '',
        title: frontmatter.title || '',
        severity: frontmatter.severity || 'compile',
        keywords: Array.isArray(frontmatter.keywords)
            ? frontmatter.keywords.join(', ')
            : (frontmatter.keywords || ''),
        source: frontmatter.source || 'agent',
        phenomena: body.phenomena || '',
        cause: body.cause || '',
        solution: body.solution || '',
        rules: frontmatter.rules || '',
        count: 1,
        // 仅用于日志，不存入 DB
        _bsc_versions: frontmatter.bsc_versions || null,
    };
}

// ── 标题相似度（基于 _similarity.mjs 的 Jaccard 算法） ──

const STOP_WORDS = new Set([
    'the', 'and', 'for', 'not', 'are', 'can', 'has', 'use', 'with', 'that',
    'this', 'from', 'will', 'when', 'your', 'you', 'its', 'all', 'but',
    'have', 'been', 'was', 'one', 'how', 'then', 'also', 'may',
]);

/**
 * 计算两个标题的 Jaccard 相似度（token 级别）
 * 与 _similarity.mjs 的 jaccardSimilarity() 算法一致
 */
function titleSimilarity(a, b) {
    const tokenize = (s) => {
        const lower = s.toLowerCase();
        // 提取中英文 token：英文按空白分割，中文单独提取
        const tokens = lower
            .replace(/[^a-z0-9\u4e00-\u9fff]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2 && !STOP_WORDS.has(t));
        // 也提取中文单字
        const chineseChars = [...lower].filter(c => /[\u4e00-\u9fff]/.test(c));
        return new Set([...tokens, ...chineseChars]);
    };

    const setA = tokenize(a);
    const setB = tokenize(b);

    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const item of setA) {
        if (setB.has(item)) intersection++;
    }

    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
}

// ── 迁移：确保 errors 表有 severity 和 source 字段 ──

function migrateErrorColumns(db) {
    const columns = [
        "ALTER TABLE errors ADD COLUMN severity TEXT DEFAULT 'compile'",
        "ALTER TABLE errors ADD COLUMN source TEXT DEFAULT 'specmate'",
    ];
    for (const sql of columns) {
        try { db.run(sql); } catch (_) { /* 字段已存在 */ }
    }
}

// ── 主函数 ──

async function main() {
    // 解析命令行参数
    const args = process.argv.slice(2);
    let markdownContent;

    if (args.includes('--stdin')) {
        // 从 stdin 读取
        const chunks = [];
        for await (const chunk of process.stdin) {
            chunks.push(chunk);
        }
        markdownContent = Buffer.concat(chunks).toString('utf-8');
    } else if (args.length >= 1) {
        const filePath = args[0];
        if (!existsSync(filePath)) {
            console.error(`错误: 文件不存在: ${filePath}`);
            process.exit(1);
        }
        markdownContent = readFileSync(filePath, 'utf-8');
    } else {
        console.error('用法: node scripts/import-agent-experience.mjs <markdown-file-path>');
        console.error('  或: cat experience.md | node scripts/import-agent-experience.mjs --stdin');
        process.exit(1);
    }

    // 解析 Markdown
    const entries = parseMarkdown(markdownContent);

    if (entries.length === 0) {
        console.log('未找到任何经验条目。请检查文件格式。');
        process.exit(0);
    }

    console.log(`解析到 ${entries.length} 条经验，正在导入...\n`);

    // 初始化数据库
    initDataDir();
    const DB_PATH = getDBPath();
    const SQL = await initSqlJs();

    let db;
    if (existsSync(DB_PATH)) {
        const buf = readFileSync(DB_PATH);
        db = new SQL.Database(buf);
    } else {
        const dbDir = dirname(DB_PATH);
        if (!existsSync(dbDir)) {
            mkdirSync(dbDir, { recursive: true });
        }
        db = new SQL.Database();
    }

    // 确保表结构存在
    initDB(db);
    migrateErrorColumns(db);

    // 逐条导入
    let added = 0;
    let skipped = 0;
    let updated = 0;

    for (const entry of entries) {
        if (!entry.code) {
            console.log(`[WARN] 缺少 code 字段，已跳过`);
            continue;
        }

        const existing = getError(db, entry.code);

        if (existing) {
            const sim = titleSimilarity(existing.title, entry.title);
            const simPct = (sim * 100).toFixed(0);

            if (sim > 0.8) {
                console.log(`[SKIP] ${entry.code} ${entry.title} — 已存在且相似 (${simPct}%)`);
                skipped++;
            } else {
                console.log(`[UPDATE] ${entry.code} ${entry.title}`);
                upsertError(db, entry);
                updated++;
            }
        } else {
            // 按 specmate 存储要求：severity 有默认值 compile
            // source 来自 Agent 经验，设置为 agent
            const title = entry.title || entry.code;
            console.log(`[NEW] ${entry.code} ${title}`);
            upsertError(db, entry);
            added++;
        }
    }

    // 保存数据库
    const data = db.export();
    const buf = Buffer.from(data);
    writeFileSync(DB_PATH, buf);
    db.close();

    // 汇总
    const conflicts = 0; // 当前实现无冲突机制，保留占位
    console.log(`\n导入完成: ${added} 新增, ${skipped} 跳过, ${conflicts} 冲突`);
    if (updated > 0) {
        console.log(`  (其中 ${updated} 条因相似度低进行了更新)`);
    }
}

main().catch(err => {
    console.error('导入失败:', err.message);
    process.exit(1);
});
