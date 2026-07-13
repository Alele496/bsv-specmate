#!/usr/bin/env node

/**
 * verify-traps.mjs — QA CLI: 列出所有 verified=false 的 trap，按严重程度排序
 *
 * 用法：
 *   node scripts/verify-traps.mjs
 *   node scripts/verify-traps.mjs --csv        # CSV 格式输出
 *   node scripts/verify-traps.mjs --json       # JSON 格式输出
 *   node scripts/verify-traps.mjs --count      # 仅输出计数
 *   node scripts/verify-traps.mjs --hard-only  # 仅列出 hard 级别
 */

import { GRAPH, UNIVERSAL_TRAPS } from '../src/tools/_matcher.mjs';

const args = process.argv.slice(2);
const asCsv = args.includes('--csv');
const asJson = args.includes('--json');
const countOnly = args.includes('--count');
const hardOnly = args.includes('--hard-only');

// ─── collect ─────────────────────────────────────────────

const all = [];
for (const [i, t] of UNIVERSAL_TRAPS.entries()) {
    all.push({ ...t, _source: `UNIVERSAL_TRAPS[${i}]` });
}
for (const [nodeName, node] of Object.entries(GRAPH)) {
    if (node.traps) {
        for (const [i, trap] of node.traps.entries()) {
            all.push({ ...trap, _source: `GRAPH.${nodeName}[${i}]` });
        }
    }
}

// ─── filter / sort ───────────────────────────────────────

const severityOrder = { hard: 0, quality: 1, style: 2 };

let unverified = all.filter(t => t.verified === false);
if (hardOnly) {
    unverified = unverified.filter(t => t.severity === 'hard');
}
unverified.sort((a, b) => {
    const sa = severityOrder[a.severity] ?? 99;
    const sb = severityOrder[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    return a._source.localeCompare(b._source);
});

// ─── output ──────────────────────────────────────────────

if (countOnly) {
    console.log(`Total traps: ${all.length}`);
    console.log(`Unverified: ${unverified.length}  (hard=${unverified.filter(t => t.severity === 'hard').length} quality=${unverified.filter(t => t.severity === 'quality').length} style=${unverified.filter(t => t.severity === 'style').length})`);
    console.log(`Verified:   ${all.length - unverified.length}`);
    process.exit(0);
}

if (asJson) {
    const out = unverified.map(t => ({
        source: t._source,
        severity: t.severity,
        phase: t.phase || 'code',
        bscVersions: t.bscVersions || [],
        text: t.text,
    }));
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
}

// ─── table output ────────────────────────────────────────

const sevLabel = (s) => {
    if (s === 'hard') return 'HARD  ';
    if (s === 'quality') return 'QUAL  ';
    if (s === 'style') return 'STYLE ';
    return '????  ';
};

if (asCsv) {
    console.log('source,severity,phase,bscVersions,text');
    for (const t of unverified) {
        const text = t.text.replace(/"/g, '""');
        console.log(`${t._source},${t.severity},${t.phase || ''},"${(t.bscVersions || []).join(';')}","${text}"`);
    }
    process.exit(0);
}

// Default: human-readable table
console.log(`\n╔══════════════════════════════════════════════════════════════════════╗`);
console.log(`║  verify-traps — 待验证 trap 清单                                    ║`);
console.log(`╠══════════════════════════════════════════════════════════════════════╣`);
console.log(`║  总计: ${String(all.length).padStart(3)} traps  |  已验证: ${String(all.length - unverified.length).padStart(3)}  |  待验证: ${String(unverified.length).padStart(3)}                    ║`);
console.log(`╚══════════════════════════════════════════════════════════════════════╝\n`);

let lastSev = null;
for (const t of unverified) {
    if (t.severity !== lastSev) {
        const header = t.severity === 'hard' ? '── 编译硬约束 (hard) ──'
                     : t.severity === 'quality' ? '── 代码质量 (quality) ──'
                     : '── 风格建议 (style) ──';
        console.log(`\n  ${header}`);
        lastSev = t.severity;
    }
    const phaseTag = t.phase ? ` [${t.phase}]` : '';
    console.log(`  ${sevLabel(t.severity)} ${t._source.padEnd(28)} ${phaseTag}`);
    console.log(`          ${t.text}`);
}
console.log('');
