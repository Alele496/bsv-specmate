#!/usr/bin/env node
/**
 * audit-knowledge.mjs — Phase 2 knowledge base quality audit
 *
 * Audits all error docs (docs/errors/*.md) for:
 *   1. Required fields completeness (现象/原因/解决方案/规则)
 *   2. Version annotation presence (适用版本: BSC 2025.07)
 *   3. Format compatibility with parser.mjs (parseErrorFile)
 *
 * Outputs a structured audit report with issues categorized by severity.
 *
 * Usage:
 *   node scripts/audit-knowledge.mjs
 *   node scripts/audit-knowledge.mjs --json     Output as JSON
 *   node scripts/audit-knowledge.mjs --detail   Show per-file details
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseErrorFile } from '../src/db/parser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const ERRORS_DIR = join(PKG_ROOT, 'docs', 'errors');

// ── Helpers ──
// parseErrorFile imported from src/db/parser.mjs (P2-2: no more local reimplementation)

/**
 * Check if content has a version annotation line.
 * Looks for: > 适用版本: BSC 2025.07
 */
function hasVersionAnnotation(content) {
    return />\s*适用版本:\s*BSC\s+\d{4}\.\d{2}/.test(content);
}

/**
 * Check if required fields are present (non-empty).
 */
function checkRequiredFields(parsed) {
    const missing = [];
    if (!parsed.code) missing.push('code (标题解析失败)');
    if (!parsed.phenomena) missing.push('现象');
    if (!parsed.cause) missing.push('原因');
    if (!parsed.solution) missing.push('解决方案');
    if (!parsed.rules) missing.push('规则');
    return missing;
}

/**
 * Check content format compatibility: can the parser extract all sections?
 * Beyond just checking if fields are non-empty, check structural integrity.
 */
function checkFormatCompatibility(content, parsed) {
    const issues = [];

    // Check that section headers exist in the content
    const hasPhenomenaHeader = /^\*\*(?:bsc\s*输出|现象)\*\*/m.test(content) || /^##\s+(?:现象|bsc\s*输出)/m.test(content);
    const hasCauseHeader = /^\*\*原因\*\*/m.test(content) || /^##\s+原因\b/m.test(content);
    const hasSolutionHeader = /^\*\*解决\*\*/m.test(content) || /^##\s+解决/m.test(content);
    const hasRules = />\s*\*\*规则\*\*:/m.test(content) || /^##\s+规则\b/m.test(content);

    if (!hasPhenomenaHeader) issues.push('缺少"现象"章节标记');
    if (!hasCauseHeader) issues.push('缺少"原因"章节标记');
    if (!hasSolutionHeader) issues.push('缺少"解决"章节标记');
    if (!hasRules) issues.push('缺少"规则"章节标记');

    // Check title line format
    const firstLine = content.split('\n')[0] || '';
    if (!/^#\s+\S+\s*[—-]/.test(firstLine)) {
        issues.push('标题行格式不符合 parser 要求 (应为: # CODE — title)');
    }

    return issues;
}

// ── Main audit logic ──

function audit() {
    if (!existsSync(ERRORS_DIR)) {
        console.error(`Error: errors directory not found: ${ERRORS_DIR}`);
        process.exit(1);
    }

    const files = readdirSync(ERRORS_DIR)
        .filter(f => f.endsWith('.md') && f !== 'INDEX.md')
        .sort();

    if (files.length === 0) {
        console.log('No error docs found.');
        return { summary: { total: 0, pass: 0, issues: 0 }, files: [] };
    }

    const results = [];
    let totalIssues = 0;
    let passCount = 0;

    for (const filename of files) {
        const filePath = join(ERRORS_DIR, filename);
        const content = readFileSync(filePath, 'utf-8');
        const parsed = parseErrorFile(content);

        const issues = [];

        // Check 1: Required fields
        const missingFields = checkRequiredFields(parsed);
        if (missingFields.length > 0) {
            issues.push({
                type: 'missing_fields',
                severity: 'high',
                detail: `缺少字段: ${missingFields.join(', ')}`
            });
        }

        // Check 2: Version annotation
        if (!hasVersionAnnotation(content)) {
            issues.push({
                type: 'missing_version',
                severity: 'medium',
                detail: '缺少版本标注 (适用版本: BSC XXXX.XX)'
            });
        }

        // Check 3: Format compatibility
        const formatIssues = checkFormatCompatibility(content, parsed);
        for (const fi of formatIssues) {
            issues.push({
                type: 'format',
                severity: fi.includes('章节') ? 'high' : 'medium',
                detail: fi
            });
        }

        totalIssues += issues.length;
        if (issues.length === 0) passCount++;

        results.push({
            file: filename,
            code: parsed.code,
            title: parsed.title,
            hasVersion: hasVersionAnnotation(content),
            fieldStatus: {
                phenomena: parsed.phenomena ? 'ok' : 'MISSING',
                cause: parsed.cause ? 'ok' : 'MISSING',
                solution: parsed.solution ? 'ok' : 'MISSING',
                rules: parsed.rules ? 'ok' : 'MISSING',
            },
            issues,
        });
    }

    const summary = {
        total: files.length,
        pass: passCount,
        issues: totalIssues,
        passRate: files.length > 0 ? ((passCount / files.length) * 100).toFixed(1) + '%' : 'N/A',
    };

    return { summary, files: results };
}

// ── Output formatting ──

function formatReport({ summary, files }, format = 'text') {
    if (format === 'json') {
        console.log(JSON.stringify({ summary, files }, null, 2));
        return;
    }

    // Text report
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('  specmate 知识库审计报告');
    console.log('═══════════════════════════════════════════════');
    console.log('');
    console.log(`审计日期: ${new Date().toISOString().split('T')[0]}`);
    console.log(`文档总数: ${summary.total}`);
    console.log(`完全通过: ${summary.pass}`);
    console.log(`需修复:   ${summary.total - summary.pass}`);
    console.log(`问题总数: ${summary.issues}`);
    console.log(`通过率:   ${summary.passRate}`);
    console.log('');

    // Summary by issue type
    const issueTypes = {};
    for (const f of files) {
        for (const issue of f.issues) {
            const key = `${issue.type} (${issue.severity})`;
            issueTypes[key] = (issueTypes[key] || 0) + 1;
        }
    }

    if (Object.keys(issueTypes).length > 0) {
        console.log('问题分类统计:');
        console.log('───────────────────────────────────────────────');
        for (const [type, count] of Object.entries(issueTypes)) {
            const label = type === 'missing_fields (high)' ? '缺少必填字段 (严重)' :
                          type === 'missing_version (medium)' ? '缺少版本标注 (中等)' :
                          type === 'format (high)' ? '格式不兼容 (严重)' :
                          type === 'format (medium)' ? '格式问题 (中等)' :
                          type;
            console.log(`  ${label}: ${count} 篇`);
        }
        console.log('');
    }

    // Per-file details
    console.log('按文件明细:');
    console.log('───────────────────────────────────────────────');
    for (const f of files) {
        const status = f.issues.length === 0 ? 'PASS' : `FAIL (${f.issues.length} issue(s))`;
        const icon = f.issues.length === 0 ? '  PASS' : '  FAIL';

        console.log(`${icon}  ${f.file}`);
        console.log(`        Code: ${f.code || '(未解析)'}  Title: ${f.title || '(未解析)'}`);
        console.log(`        现象: ${f.fieldStatus.phenomena}  原因: ${f.fieldStatus.cause}  解决: ${f.fieldStatus.solution}  规则: ${f.fieldStatus.rules}`);
        console.log(`        版本标注: ${f.hasVersion ? 'YES' : 'MISSING'}`);

        for (const issue of f.issues) {
            const sev = issue.severity === 'high' ? '!!' : '! ';
            console.log(`        ${sev} ${issue.detail}`);
        }
        console.log('');
    }

    // Recommendations
    console.log('改进建议:');
    console.log('───────────────────────────────────────────────');

    const missingVersionCount = files.filter(f => !f.hasVersion).length;
    if (missingVersionCount > 0) {
        console.log(`  1. ${missingVersionCount} 篇文档缺少版本标注。建议批量添加:`);
        console.log(`     > 适用版本: BSC 2025.07 | 自动生成: YYYY-MM-DD | 来源: N captures`);
    }

    const missingFieldsCount = files.filter(f => f.issues.some(i => i.type === 'missing_fields')).length;
    if (missingFieldsCount > 0) {
        console.log(`  2. ${missingFieldsCount} 篇文档缺少必填字段（现象/原因/解决方案/规则）。`);
        console.log(`     缺少这些字段会导致 specmate_guide(on_error) 返回不完整信息。`);
    }

    const formatIssueCount = files.filter(f => f.issues.some(i => i.type === 'format')).length;
    if (formatIssueCount > 0) {
        console.log(`  3. ${formatIssueCount} 篇文档格式不兼容 parser.mjs，可能导致入库失败。`);
        console.log(`     确保使用粗体格式（**现象**/**原因**/**解决**）或标题格式（## 现象/## 原因/## 解决方案）。`);
    }

    if (summary.pass === summary.total) {
        console.log('  全部通过！知识库质量良好。');
    }

    console.log('');
}

// ── Entry ──

const args = process.argv.slice(2);
const useJson = args.includes('--json');
const useDetail = args.includes('--detail');

const report = audit();

if (useJson) {
    formatReport(report, 'json');
} else if (useDetail) {
    formatReport(report, 'text');
} else {
    // Compact mode: only show files with issues
    const { summary, files } = report;
    const filesWithIssues = files.filter(f => f.issues.length > 0);

    console.log('');
    console.log(`═══════════════════════════════════════════════`);
    console.log(`  specmate 知识库审计 — ${summary.total} 篇文档`);
    console.log(`  通过: ${summary.pass} | 有问题: ${summary.total - summary.pass} | 问题数: ${summary.issues}`);
    console.log(`═══════════════════════════════════════════════`);

    if (filesWithIssues.length === 0) {
        console.log('');
        console.log('  全部通过！知识库质量良好。');
        console.log('');
        process.exit(0);
    }

    console.log('');
    for (const f of filesWithIssues) {
        console.log(`  ${f.file} (${f.code})`);
        for (const issue of f.issues) {
            const sev = issue.severity === 'high' ? 'HIGH' : 'MED ';
            console.log(`    [${sev}] ${issue.detail}`);
        }
    }

    console.log('');
    console.log(`  使用 --detail 查看全部文档明细（含 PASS 的文档）。`);
    console.log(`  使用 --json 输出 JSON 格式。`);
    console.log('');
}

process.exit(report.summary.issues > 0 ? 1 : 0);
