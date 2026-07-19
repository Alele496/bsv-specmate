#!/usr/bin/env node
/**
 * auto-cluster.mjs — 批次三 3.1: 未知错误自动聚类 → 自动生成知识条目
 *
 * Groups unreviewed captures by error code, generates Markdown error documents
 * for new codes, and marks captures as approved.
 *
 * Usage:
 *   node scripts/auto-cluster.mjs            Run auto-clustering (writes docs)
 *   node scripts/auto-cluster.mjs --dry-run  Preview without writing files
 */

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { queryClusteredCaptures, approveCapturesByCode } from '../src/db/query.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const ERRORS_DIR = join(PKG_ROOT, 'docs', 'errors');

/**
 * Extract a short summary from aggregated bsc_output samples.
 * Takes the first non-boilerplate line from the first sample.
 */
function buildSummary(samples) {
    const firstSample = (samples || '').split('\n---\n')[0].trim();
    if (!firstSample) return 'compilation error';

    const lines = firstSample.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Skip file paths and boilerplate
        if (/^(File|Error:|Warning:|".*", line|^\^+$)/i.test(trimmed)) continue;
        if (trimmed.length > 10) {
            return trimmed.length > 80 ? trimmed.substring(0, 77) + '...' : trimmed;
        }
    }
    return 'compilation error';
}

/**
 * Format aggregated bsc_output samples for the phenomena section.
 */
function formatSamples(samples) {
    if (!samples) return '无捕获记录';

    const parts = samples.split('\n---\n').filter(s => s.trim());
    if (parts.length <= 1) {
        return '```\n' + parts[0].trim() + '\n```';
    }

    const lines = [`共 ${parts.length} 次捕获记录：`, ''];
    for (let i = 0; i < parts.length; i++) {
        lines.push(`**捕获 #${i + 1}:**`);
        lines.push('');
        lines.push('```');
        lines.push(parts[i].trim());
        lines.push('```');
        lines.push('');
    }
    return lines.join('\n');
}

/**
 * Generate a Markdown error document from cluster data.
 * Format mirrors existing docs/errors/*.md files (compatible with parser.mjs).
 */
function generateErrorDoc({ code, totalRepeat, sessionCount, samples, latestCause, latestSolution }) {
    const summary = buildSummary(samples);
    const today = new Date().toISOString().split('T')[0];
    const lines = [];

    // Title
    lines.push(`# ${code} — ${summary} (×${totalRepeat})`);
    lines.push('');

    // Version metadata
    lines.push(`> 适用版本: BSC 2025.07 | 自动生成: ${today} | 来源: ${totalRepeat} captures`);
    lines.push('');

    // Aggregation metadata
    lines.push(`> 跨 ${sessionCount} 个 session，累计 ${totalRepeat} 次捕获，自动聚类生成`);
    lines.push('');

    // Phenomena
    lines.push('**bsc 输出**：');
    lines.push('');
    lines.push(formatSamples(samples));
    lines.push('');

    // Cause
    lines.push('**原因**：');
    lines.push('');
    if (latestCause) {
        lines.push(latestCause);
    } else {
        lines.push('待补充（请根据上述现象分析根因）');
    }
    lines.push('');

    // Solution
    lines.push('**解决**：');
    lines.push('');
    if (latestSolution) {
        lines.push(latestSolution);
    } else {
        lines.push('待补充（请根据根因提供具体解决方案）');
    }
    lines.push('');

    // Rules
    const rulesHint = latestCause || latestSolution
        ? '> **规则**: 待补充'
        : '> **规则**: 待补充（自动聚类草稿，需人工审查）';
    lines.push(rulesHint);
    lines.push('');

    return lines.join('\n');
}

// ── Main ──

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

async function main() {
    console.log(`[auto-cluster] ${dryRun ? 'DRY-RUN 模式' : '运行模式'} — 聚类阈值: >=3次重复, >=2个session\n`);

    // 1. Fetch clusters
    const clusters = await queryClusteredCaptures(3, 2);

    if (clusters.length === 0) {
        console.log('没有符合条件的聚类。');
        return;
    }

    console.log(`发现 ${clusters.length} 个聚类:\n`);

    // 2. Process each cluster
    let generated = 0;
    let skipped = 0;
    let approved = 0;

    for (const cluster of clusters) {
        const { code, total_repeat: totalRepeat, session_count: sessionCount, samples, latest_cause: latestCause, latest_solution: latestSolution } = cluster;

        const filePath = join(ERRORS_DIR, `${code}.md`);
        const exists = existsSync(filePath);

        console.log(`  [${code}] total=${totalRepeat} sessions=${sessionCount}${exists ? ' [已存在]' : ''}`);

        if (dryRun) {
            if (exists) {
                console.log(`    → 跳过生成（已存在），will mark approved`);
            } else {
                console.log(`    → 将生成 ${filePath}`);
            }
            console.log(`    → 将标记 ${code} 的 captures 为 approved`);
            continue;
        }

        // 3a. Generate doc if not exists
        if (!exists) {
            // Ensure directory exists
            if (!existsSync(ERRORS_DIR)) {
                mkdirSync(ERRORS_DIR, { recursive: true });
            }

            const docContent = generateErrorDoc({
                code,
                totalRepeat,
                sessionCount,
                samples: samples || '',
                latestCause: latestCause || '',
                latestSolution: latestSolution || '',
            });

            writeFileSync(filePath, docContent, 'utf-8');
            console.log(`    → 已生成 ${filePath}`);
            generated++;
        } else {
            skipped++;
        }

        // 3b. Mark captures as approved
        try {
            const result = await approveCapturesByCode(code);
            console.log(`    → 已标记 ${result.updated} 条 captures 为 approved`);
            approved += result.updated;
        } catch (err) {
            console.error(`    → 标记失败: ${err.message}`);
        }
    }

    console.log(`\n[auto-cluster] 完成: 生成 ${generated} 篇, 跳过 ${skipped} 篇, 标记 ${approved} 条 captures`);
}

main().catch(err => {
    console.error('[auto-cluster] 错误:', err.message);
    process.exit(1);
});
