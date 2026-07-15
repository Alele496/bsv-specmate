#!/usr/bin/env node
/**
 * generate-error-doc.mjs — Phase 2 quality-enhanced auto-cluster draft generator
 *
 * Generates a Markdown error document from aggregated capture data.
 * Output goes to docs/errors/_drafts/<CODE>.md (not directly to docs/errors/).
 *
 * Quality layers:
 *   L1 — Code duplicate detection: if docs/errors/<CODE>.md exists → append sub-scenario
 *   L2 — Semantic conflict detection: Jaccard similarity on cause entities
 *        - > 0.7 AND solution differs → CONFLICT → _drafts/<CODE>_CONFLICT.md
 *        - <= 0.3 → safe new sub-scenario, append directly
 *        - 0.3 < similarity <= 0.7 → gray zone, mark needs_human_review
 *   L3 — Version annotation: metadata line with BSC version, date, capture count
 *
 * Format: compatible with src/db/parser.mjs (bold-marker format).
 *
 * Usage (CLI):
 *   node scripts/generate-error-doc.mjs --code=P0030 --captures-json='[...]'
 *
 * Usage (programmatic):
 *   import { generateDraft, appendSubScenario, writeDraft, detectConflict, resolveConflict } from './generate-error-doc.mjs';
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const ERRORS_DIR = join(PKG_ROOT, 'docs', 'errors');
const DRAFTS_DIR = join(ERRORS_DIR, '_drafts');

/**
 * Build a summary line for the title from the capture samples.
 * Extracts the first recognizable error message snippet.
 * @param {string} samples - aggregated bsc_output, separated by '---'
 * @returns {string} short summary (max 80 chars)
 */
function buildSummary(samples) {
    // Take first non-empty line from first sample
    const firstSample = (samples || '').split('---')[0].trim();
    if (!firstSample) return 'compilation error';

    // Try to find an error message line (starts with Error: or contains "error")
    const lines = firstSample.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Skip file paths and boilerplate
        if (trimmed.match(/^(File|Error:|Warning:|".*", line|^\^+$)/i)) {
            continue;
        }
        if (trimmed.length > 10) {
            // Take first meaningful line, truncate to 80 chars
            return trimmed.length > 80 ? trimmed.substring(0, 77) + '...' : trimmed;
        }
    }

    // Fallback: use the second line of the first sample
    const meaningfulLines = lines.filter(l => l.trim().length > 10 && !l.match(/^(File|".*", line)/));
    if (meaningfulLines.length > 0) {
        const summary = meaningfulLines[0].trim();
        return summary.length > 80 ? summary.substring(0, 77) + '...' : summary;
    }

    return 'compilation error';
}

// ═══════════════════════════════════════════════════════════════════
// L2 — Semantic conflict detection
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract key entities (noun phrases / technical terms) from cause/solution text.
 * Handles mixed Chinese/English BSV technical descriptions.
 * @param {string} text
 * @returns {Set<string>} set of normalized key entities
 */
function extractKeyEntities(text) {
    if (!text) return new Set();

    // Normalize: lowercase, remove punctuation
    const normalized = text.toLowerCase().replace(
        /[.,;:!?()[\]{}"'`~@#$%^&*+=/\\|<>，。；：！？（）【】「」『』""''`～＠＃＄％＾＆＊＋＝＼｜＜＞\n\r\t]/g,
        ' '
    );

    const tokens = [];
    const words = normalized.split(/\s+/).filter(w => w.length > 0);

    for (const word of words) {
        // English/technical terms (keep whole words)
        if (/^[a-z0-9_#.]+$/.test(word) && word.length >= 2) {
            tokens.push(word);
        } else {
            // Chinese text: character bigrams for semantic matching
            const chars = [...word].filter(c => /[\u4e00-\u9fff]/.test(c));
            for (let i = 0; i < chars.length - 1; i++) {
                tokens.push(chars[i] + chars[i + 1]);
            }
            // Also keep single chars for short text
            if (chars.length === 1) {
                tokens.push(chars[0]);
            }
        }
    }

    // Stop words — common words that carry little semantic weight in BSV context
    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
        'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
        'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
        'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every',
        'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
        'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because',
        'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them',
        'what', 'which', 'who', 'whom', 'when', 'where', 'how',
        '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
        '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
        '没有', '看', '好', '自己', '这', '他', '她', '它', '们',
        '可以', '需要', '必须', '应该', '如果', '因为', '所以',
        '已经', '还是', '或者', '但是', '虽然', '然后', '这个',
        '那个', '这些', '那些', '什么', '怎么', '哪里', '为什么',
        // BSV-specific low-signal words
        'code', 'error', 'line', 'file', 'column', 'bsc', 'bsv',
        '使用', '处理', '进行', '通过', '检查', '检测', '一种',
    ]);

    return new Set(tokens.filter(t => !stopWords.has(t) && t.length >= 2));
}

/**
 * Calculate Jaccard similarity coefficient between two sets.
 * J(A, B) = |A ∩ B| / |A ∪ B|
 * @param {Set} setA
 * @param {Set} setB
 * @returns {number} similarity coefficient (0.0 - 1.0)
 */
function calculateJaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 1.0;
    if (setA.size === 0 || setB.size === 0) return 0.0;

    let intersection = 0;
    for (const item of setA) {
        if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

/**
 * Parse existing error doc content to extract cause/solution per scenario.
 * Each "## 场景 N:" block is treated as one scenario.
 * The content before the first "## 场景" is treated as scenario 0 (main content).
 * @param {string} content
 * @returns {Array<{ scenarioLabel: string, cause: string, solution: string }>}
 */
function parseExistingScenarios(content) {
    const scenarios = [];

    // Match scenario headers: "## 场景 N：" or "## 场景 N:"  (Chinese or ASCII colon)
    const scenarioRegex = /^##\s+(场景\s+\d+[：:].*)$/gm;
    const parts = [];
    let match;

    while ((match = scenarioRegex.exec(content)) !== null) {
        parts.push({ header: match[1], start: match.index + match[0].length });
    }

    // If no scenario markers found, treat the whole doc (minus title) as one scenario
    if (parts.length === 0) {
        const cause = extractSectionContent(content, 'cause');
        const solution = extractSectionContent(content, 'solution');
        if (cause) {
            scenarios.push({ scenarioLabel: '主文档', cause, solution });
        }
        return scenarios;
    }

    // Extract each scenario's cause and solution
    for (let i = 0; i < parts.length; i++) {
        // Find the next scenario header to determine this block's end
        const nextHeaderMatch = content.substring(parts[i].start).match(/^##\s+场景\s+\d+[：:]/m);
        const blockEnd = nextHeaderMatch
            ? parts[i].start + nextHeaderMatch.index
            : content.length;
        const blockContent = content.substring(parts[i].start, blockEnd);

        const cause = extractSectionContent(blockContent, 'cause');
        const solution = extractSectionContent(blockContent, 'solution');
        scenarios.push({
            scenarioLabel: parts[i].header.trim(),
            cause,
            solution
        });
    }

    return scenarios;
}

/**
 * Extract content of a named section from markdown text.
 * Looks for both bold-marker format (**section**) and heading format (## section).
 * @param {string} text
 * @param {'cause'|'solution'|'phenomena'|'rules'} section
 * @returns {string}
 */
function extractSectionContent(text, section) {
    const patterns = {
        cause: { bold: /\*\*原因\*\*/g, heading: /^##\s+原因\b/gm },
        solution: { bold: /\*\*解决\*\*/g, heading: /^##\s+解决(?:方案)?/gm },
        phenomena: { bold: /\*\*(?:现象|bsc\s*输出)\*\*/g, heading: /^##\s+(?:现象|bsc\s*输出)/gm },
        rules: { bold: />\s*\*\*规则\*\*:/g, heading: /^##\s+规则\b/gm },
    };

    const pat = patterns[section];
    if (!pat) return '';

    // Find the section start
    let startMatch;
    let startIdx = -1;

    // Try heading format first
    startMatch = pat.heading.exec(text);
    if (startMatch) {
        startIdx = startMatch.index + startMatch[0].length;
    } else {
        // Try bold format
        startMatch = pat.bold.exec(text);
        if (startMatch) {
            startIdx = startMatch.index + startMatch[0].length;
        }
    }

    if (startIdx === -1) return '';

    // Extract content until next section marker or end of text
    const remaining = text.substring(startIdx);
    const nextSectionMatch = remaining.match(/^#|^\*\*(?:现象|bsc\s*输出|原因|解决)\*\*|^##\s+(?:现象|bsc\s*输出|原因|解决|规则|场景)/m);
    const contentEnd = nextSectionMatch ? nextSectionMatch.index : remaining.length;

    return remaining.substring(0, contentEnd).trim();
}

/**
 * Detect semantic conflict between new capture data and existing error doc.
 *
 * Decision matrix:
 *   - similarity > 0.7 AND solutions differ → 'conflict'
 *   - similarity <= 0.3 → 'safe' (new distinct sub-scenario)
 *   - 0.3 < similarity <= 0.7 → 'gray' (needs human review)
 *   - similarity > 0.7 AND solutions similar → 'safe' (same root cause, same fix)
 *
 * @param {string} existingContent — content of docs/errors/<CODE>.md
 * @param {object} newCapture — { latestCause, latestSolution, ... }
 * @returns {{ level: 'safe'|'gray'|'conflict', similarity: number, matchedScenario: object|null, detail: string }}
 */
export function detectConflict(existingContent, { latestCause = '', latestSolution = '' }) {
    const newEntities = extractKeyEntities(latestCause);
    const newSolutionEntities = extractKeyEntities(latestSolution);

    const scenarios = parseExistingScenarios(existingContent);

    let bestSimilarity = 0;
    let bestScenario = null;

    for (const sc of scenarios) {
        const existingEntities = extractKeyEntities(sc.cause);
        const sim = calculateJaccardSimilarity(newEntities, existingEntities);
        if (sim > bestSimilarity) {
            bestSimilarity = sim;
            bestScenario = sc;
        }
    }

    // Check if the most similar existing scenario has a different solution
    let solutionsDiffer = true;
    if (bestScenario && bestSimilarity > 0.3) {
        const existingSolEntities = extractKeyEntities(bestScenario.solution);
        const solSim = calculateJaccardSimilarity(newSolutionEntities, existingSolEntities);
        // Solutions are considered "same" if similarity > 0.5
        solutionsDiffer = solSim <= 0.5;
    }

    let level;
    let detail;

    if (bestSimilarity > 0.7 && solutionsDiffer) {
        level = 'conflict';
        detail = `原因高度相似 (${(bestSimilarity * 100).toFixed(0)}%) 但解决方案不同`;
    } else if (bestSimilarity <= 0.3) {
        level = 'safe';
        detail = `原因差异显著 (${(bestSimilarity * 100).toFixed(0)}%)，判定为新子场景`;
    } else if (bestSimilarity > 0.7 && !solutionsDiffer) {
        level = 'safe';
        detail = `原因高度相似 (${(bestSimilarity * 100).toFixed(0)}%) 且解决方案一致，可能是同一问题的重复捕获`;
    } else {
        level = 'gray';
        detail = `原因相似度在灰色地带 (${(bestSimilarity * 100).toFixed(0)}%)，需人工判断`;
    }

    return {
        level,
        similarity: Math.round(bestSimilarity * 100) / 100,
        matchedScenario: bestScenario,
        detail,
        solutionsDiffer,
    };
}

/**
 * Generate a CONFLICT Markdown file for cases where new capture conflicts
 * with an existing sub-scenario (high similarity, different solutions).
 *
 * @param {object} params
 * @param {string} params.code
 * @param {object} params.conflictResult — from detectConflict()
 * @param {string} params.latestCause
 * @param {string} params.latestSolution
 * @param {string} params.samples
 * @param {number} params.totalRepeat
 * @param {number} params.sessionCount
 * @returns {string} Markdown content for the conflict file
 */
function formatConflictDoc({ code, conflictResult, latestCause, latestSolution, samples, totalRepeat, sessionCount }) {
    const today = new Date().toISOString().split('T')[0];
    const lines = [];

    lines.push(`# ${code} — CONFLICT DETECTED`);
    lines.push('');
    lines.push(`> 语义冲突检测 | 相似度: ${conflictResult.similarity} | ${conflictResult.detail} | 检测日期: ${today}`);
    lines.push('');

    // New capture info
    lines.push('## 新捕获 (New Capture)');
    lines.push('');
    lines.push(`> 跨 ${sessionCount} 个 session，累计 ${totalRepeat} 次捕获，自动聚类生成`);
    lines.push('');
    lines.push('**原因**');
    lines.push('');
    lines.push(latestCause || '待补充');
    lines.push('');
    lines.push('**解决**');
    lines.push('');
    lines.push(latestSolution || '待补充');
    lines.push('');

    // Existing scenario info
    if (conflictResult.matchedScenario) {
        lines.push('## 已有场景 (Existing)');
        lines.push('');
        lines.push(`### ${conflictResult.matchedScenario.scenarioLabel}`);
        lines.push('');
        lines.push('**原因**');
        lines.push('');
        lines.push(conflictResult.matchedScenario.cause || '(无法提取)');
        lines.push('');
        lines.push('**解决**');
        lines.push('');
        lines.push(conflictResult.matchedScenario.solution || '(无法提取)');
        lines.push('');
    }

    // Conflict analysis
    lines.push('## 冲突分析');
    lines.push('');
    lines.push(`- **原因相似度**: ${conflictResult.similarity} (阈值: 0.7)`);
    lines.push(`- **判定**: ${conflictResult.detail}`);
    lines.push('- **建议**: 人工审查新旧两个版本的 cause/solution，决定保留哪个');
    lines.push('');

    // Resolution instructions
    lines.push('## 解决方案');
    lines.push('');
    lines.push('```');
    lines.push(`npx specmate review --resolve-conflict ${code} --keep=new    # 保留新版本（覆盖旧场景）`);
    lines.push(`npx specmate review --resolve-conflict ${code} --keep=old    # 保留旧版本（丢弃新捕获）`);
    lines.push(`npx specmate review --resolve-conflict ${code} --keep=merge  # 合并（新旧各为一个独立子场景）`);
    lines.push('```');

    return lines.join('\n');
}

/**
 * Resolve a detected conflict by applying the chosen resolution strategy.
 *
 * @param {string} code — error code
 * @param {string} keep — resolution strategy: 'new' | 'old' | 'merge'
 * @param {object} captureParams — { latestCause, latestSolution, samples, totalRepeat, sessionCount }
 * @returns {{ action: string, dryRun: boolean, message: string }}
 *   Returns the action taken and a human-readable message.
 */
export function resolveConflict(code, keep, captureParams) {
    const existingPath = join(ERRORS_DIR, `${code}.md`);
    const draftPath = join(DRAFTS_DIR, `${code}.md`);
    const conflictPath = join(DRAFTS_DIR, `${code}_CONFLICT.md`);

    if (!existsSync(conflictPath)) {
        return {
            action: 'none',
            dryRun: false,
            message: `没有找到 ${code} 的冲突文件。${conflictPath} 不存在。`
        };
    }

    if (!['new', 'old', 'merge'].includes(keep)) {
        return {
            action: 'none',
            dryRun: false,
            message: `无效的 --keep 值: ${keep}。有效值: new, old, merge`
        };
    }

    // Ensure drafts directory exists
    if (!existsSync(DRAFTS_DIR)) {
        mkdirSync(DRAFTS_DIR, { recursive: true });
    }

    switch (keep) {
        case 'new': {
            // Write new capture as the draft (overwrite mode)
            const newContent = generateDraft({
                code,
                totalRepeat: captureParams.totalRepeat || 1,
                sessionCount: captureParams.sessionCount || 1,
                samples: captureParams.samples || '',
                latestCause: captureParams.latestCause || '',
                latestSolution: captureParams.latestSolution || '',
            });
            writeFileSync(draftPath, newContent, 'utf-8');
            unlinkSync(conflictPath);
            return {
                action: 'keep-new',
                dryRun: false,
                message: `冲突已解决：保留新版本。草稿已写入 ${draftPath}。冲突文件已删除。`
            };
        }
        case 'old': {
            // Just delete the conflict file, keep existing doc as-is
            unlinkSync(conflictPath);
            return {
                action: 'keep-old',
                dryRun: false,
                message: `冲突已解决：保留旧版本。冲突文件已删除。${existingPath} 保持不变。`
            };
        }
        case 'merge': {
            // Read existing content and append new as sub-scenario (skip conflict check)
            const existingContent = existsSync(existingPath)
                ? readFileSync(existingPath, 'utf-8')
                : '';
            const mergedContent = existingContent
                ? appendSubScenario(existingContent, {
                    code,
                    totalRepeat: captureParams.totalRepeat || 1,
                    sessionCount: captureParams.sessionCount || 1,
                    samples: captureParams.samples || '',
                    latestCause: captureParams.latestCause || '',
                    latestSolution: captureParams.latestSolution || '',
                })
                : generateDraft({
                    code,
                    totalRepeat: captureParams.totalRepeat || 1,
                    sessionCount: captureParams.sessionCount || 1,
                    samples: captureParams.samples || '',
                    latestCause: captureParams.latestCause || '',
                    latestSolution: captureParams.latestSolution || '',
                });
            writeFileSync(draftPath, mergedContent, 'utf-8');
            unlinkSync(conflictPath);
            return {
                action: 'merge',
                dryRun: false,
                message: `冲突已解决：合并模式。新旧版本各为独立子场景。草稿已写入 ${draftPath}。冲突文件已删除。`
            };
        }
        default:
            return { action: 'none', dryRun: false, message: '未知操作' };
    }
}

// ═══════════════════════════════════════════════════════════════════
// Document generation (L3 version annotation included)
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate version annotation metadata line (L3).
 * @param {number} captureCount — number of captures this doc is based on
 * @returns {string}
 */
function versionAnnotation(captureCount) {
    const today = new Date().toISOString().split('T')[0];
    return `> 适用版本: BSC 2025.07 | 自动生成: ${today} | 来源: ${captureCount} captures`;
}

/**
 * Generate a full Markdown error document from aggregated captures.
 * Format: compatible with parser.mjs parseErrorFile().
 *
 * @param {object} params
 * @param {string} params.code - error code (e.g. "P0005")
 * @param {number} params.totalRepeat - total repeat count across sessions
 * @param {number} params.sessionCount - number of distinct sessions
 * @param {string} params.samples - aggregated bsc_output from all captures
 * @param {string} params.latestCause - most recent cause (if available)
 * @param {string} params.latestSolution - most recent solution (if available)
 * @returns {string} Markdown content
 */
export function generateDraft({ code, totalRepeat = 1, sessionCount = 1, samples = '', latestCause = '', latestSolution = '' }) {
    const summary = buildSummary(samples);
    const lines = [];

    // Title line: # CODE — summary (×N)
    lines.push(`# ${code} \u2014 ${summary} (\u00d7${totalRepeat})`);
    lines.push('');

    // L3: Version annotation metadata
    lines.push(versionAnnotation(totalRepeat));
    lines.push('');

    // Aggregation metadata
    lines.push(`> \u8de8 ${sessionCount} \u4e2a session\uff0c\u7d2f\u8ba1 ${totalRepeat} \u6b21\u6355\u83b7\uff0c\u81ea\u52a8\u805a\u7c7b\u751f\u6210`);
    lines.push('');

    // Phenomena section
    lines.push('**\u73b0\u8c61**');
    lines.push('');
    lines.push(formatSamples(samples));
    lines.push('');

    // Cause section
    lines.push('**\u539f\u56e0**');
    lines.push('');
    if (latestCause) {
        lines.push(latestCause);
    } else {
        lines.push('\u5f85\u8865\u5145\uff08\u8bf7\u6839\u636e\u4e0a\u8ff0\u73b0\u8c61\u5206\u6790\u6839\u56e0\uff09');
    }
    lines.push('');

    // Solution section
    lines.push('**\u89e3\u51b3**');
    lines.push('');
    if (latestSolution) {
        lines.push(latestSolution);
    } else {
        lines.push('\u5f85\u8865\u5145\uff08\u8bf7\u6839\u636e\u6839\u56e0\u63d0\u4f9b\u5177\u4f53\u89e3\u51b3\u65b9\u6848\uff09');
    }
    lines.push('');

    // Rules section
    lines.push('> **\u89c4\u5219**: \u5f85\u8865\u5145');
    lines.push('');

    return lines.join('\n');
}

/**
 * Format aggregated bsc_output samples for the phenomena section.
 * Each sample is separated by '---' in the aggregated field.
 * @param {string} samples
 * @returns {string}
 */
function formatSamples(samples) {
    if (!samples) return '\u65e0\u6355\u83b7\u8bb0\u5f55';

    const parts = samples.split('\n---\n');
    if (parts.length <= 1) {
        // Single sample: output as-is in code block
        return '```\n' + parts[0].trim() + '\n```';
    }

    // Multiple samples: list each in a code block
    const lines = [];
    lines.push(`\u5171 ${parts.length} \u6b21\u6355\u83b7\u8bb0\u5f55\uff1a`);
    lines.push('');
    for (let i = 0; i < parts.length; i++) {
        const sample = parts[i].trim();
        if (!sample) continue;
        lines.push(`**\u6355\u83b7 #${i + 1}:**`);
        lines.push('');
        lines.push('```');
        lines.push(sample);
        lines.push('```');
        lines.push('');
    }
    return lines.join('\n');
}

/**
 * Count existing scenarios in an error doc to determine next scenario number.
 * @param {string} content - existing .md file content
 * @returns {number} next scenario number (1 if no sub-scenarios exist)
 */
function countScenarios(content) {
    const matches = content.match(/##\s+场景\s+(\d+)[：:]/g);
    if (!matches || matches.length === 0) return 1;
    // The main content counts as scenario 1, so sub-scenarios start at 2
    // But existing explicit "## 场景 1" also counts, so next = length + 1
    return matches.length + 1;
}

/**
 * Append a new sub-scenario to an existing error doc.
 * The existing file's main content is treated as "场景 1".
 *
 * @param {string} existingContent - content of docs/errors/<CODE>.md
 * @param {object} params - same as generateDraft
 * @returns {string} merged content with sub-scenario appended
 */
export function appendSubScenario(existingContent, { code, totalRepeat = 1, sessionCount = 1, samples = '', latestCause = '', latestSolution = '' }) {
    const scenarioNum = countScenarios(existingContent);
    const summary = buildSummary(samples);

    const lines = [];
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`## \u573a\u666f ${scenarioNum}\uff1a${summary}`);

    // L3: Version annotation for sub-scenario
    lines.push('');
    lines.push(`> \u9002\u7528\u7248\u672c: BSC 2025.07 | \u81ea\u52a8\u751f\u6210: ${new Date().toISOString().split('T')[0]} | \u6765\u6e90: ${totalRepeat} captures`);
    lines.push('');
    lines.push(`> \u8de8 ${sessionCount} \u4e2a session\uff0c\u7d2f\u8ba1 ${totalRepeat} \u6b21\u6355\u83b7\uff0c\u81ea\u52a8\u805a\u7c7b\u751f\u6210`);
    lines.push('');

    // Phenomena
    lines.push('**\u73b0\u8c61**');
    lines.push('');
    lines.push(formatSamples(samples));
    lines.push('');

    // Cause
    lines.push('**\u539f\u56e0**');
    lines.push('');
    if (latestCause) {
        lines.push(latestCause);
    } else {
        lines.push('\u5f85\u8865\u5145');
    }
    lines.push('');

    // Solution
    lines.push('**\u89e3\u51b3**');
    lines.push('');
    if (latestSolution) {
        lines.push(latestSolution);
    } else {
        lines.push('\u5f85\u8865\u5145');
    }
    lines.push('');

    return existingContent.trimEnd() + '\n' + lines.join('\n') + '\n';
}

/**
 * Main entry point.
 *
 * Quality pipeline:
 *   L1: Check if docs/errors/<CODE>.md exists → append vs new
 *   L2: If existing, run semantic conflict detection
 *   L3: Add version annotation metadata
 *
 * @param {object} params
 * @param {string} params.code - error code
 * @param {number} params.totalRepeat - total repeat count
 * @param {number} params.sessionCount - session count
 * @param {string} params.samples - aggregated bsc_output
 * @param {string} params.latestCause - latest cause
 * @param {string} params.latestSolution - latest solution
 * @returns {{ filePath: string, isAppend: boolean, conflict: boolean|string, conflictFile: string|null, grayZone: boolean }}
 */
export function writeDraft({ code, totalRepeat, sessionCount, samples, latestCause, latestSolution }) {
    if (!existsSync(DRAFTS_DIR)) {
        mkdirSync(DRAFTS_DIR, { recursive: true });
    }

    const existingPath = join(ERRORS_DIR, `${code}.md`);
    const draftPath = join(DRAFTS_DIR, `${code}.md`);
    const conflictPath = join(DRAFTS_DIR, `${code}_CONFLICT.md`);

    let content;
    let isAppend = false;
    let conflict = false;
    let grayZone = false;

    // L1: Check if doc already exists
    if (existsSync(existingPath)) {
        const existingContent = readFileSync(existingPath, 'utf-8');

        // L2: Semantic conflict detection
        const conflictResult = detectConflict(existingContent, {
            latestCause: latestCause || '',
            latestSolution: latestSolution || '',
        });

        if (conflictResult.level === 'conflict') {
            // Write CONFLICT file instead of regular draft
            const conflictContent = formatConflictDoc({
                code,
                conflictResult,
                latestCause: latestCause || '',
                latestSolution: latestSolution || '',
                samples: samples || '',
                totalRepeat: totalRepeat || 1,
                sessionCount: sessionCount || 1,
            });
            writeFileSync(conflictPath, conflictContent, 'utf-8');
            return {
                filePath: conflictPath,
                isAppend: false,
                conflict: true,
                conflictFile: conflictPath,
                grayZone: false,
                similarity: conflictResult.similarity,
            };
        }

        // Gray zone or safe: append sub-scenario
        content = appendSubScenario(existingContent, {
            code, totalRepeat, sessionCount, samples, latestCause, latestSolution
        });

        if (conflictResult.level === 'gray') {
            // Add gray zone marker
            content += `\n> \u26a0\ufe0f needs_human_review: ${conflictResult.detail}\n`;
            grayZone = true;
        }

        isAppend = true;
    } else {
        content = generateDraft({
            code, totalRepeat, sessionCount, samples, latestCause, latestSolution
        });
    }

    writeFileSync(draftPath, content, 'utf-8');
    return {
        filePath: draftPath,
        isAppend,
        conflict: grayZone ? 'gray' : false,
        conflictFile: null,
        grayZone,
    };
}

// ── CLI mode ──
if (process.argv[1] && process.argv[1].includes('generate-error-doc')) {
    const args = process.argv.slice(2);
    const getArg = (name) => {
        const prefix = `--${name}=`;
        const arg = args.find(a => a.startsWith(prefix));
        return arg ? arg.slice(prefix.length) : null;
    };

    const code = getArg('code');
    const capturesJson = getArg('captures-json');

    if (!code || !capturesJson) {
        console.error('Usage: node scripts/generate-error-doc.mjs --code=<CODE> --captures-json=\'[...]\'');
        process.exit(1);
    }

    let captures;
    try {
        captures = JSON.parse(capturesJson);
    } catch (e) {
        console.error('Invalid JSON for --captures-json:', e.message);
        process.exit(1);
    }

    if (!Array.isArray(captures) || captures.length === 0) {
        console.error('captures-json must be a non-empty array');
        process.exit(1);
    }

    // Aggregate from raw captures array
    const totalRepeat = captures.reduce((sum, c) => sum + (c.repeat_count || 1), 0);
    const sessions = new Set(captures.map(c => c.session_id).filter(Boolean));
    const sessionCount = sessions.size || 1;
    const samples = captures.map(c => c.bsc_output || '').join('\n---\n');
    const latestCause = [...captures].reverse().find(c => c.cause && c.cause.trim())?.cause || '';
    const latestSolution = [...captures].reverse().find(c => c.solution && c.solution.trim())?.solution || '';

    const result = writeDraft({ code, totalRepeat, sessionCount, samples, latestCause, latestSolution });

    if (result.conflict === true) {
        console.log(`CONFLICT detected: ${result.filePath}`);
        console.log(`  Similarity: ${result.similarity}`);
        console.log(`  Action required: npx specmate review --resolve-conflict ${code} --keep=new|old|merge`);
    } else if (result.conflict === 'gray') {
        console.log(`Gray zone (needs_human_review): ${result.filePath}`);
        console.log(`  Appended sub-scenario with needs_human_review flag.`);
    } else {
        console.log(`${result.isAppend ? 'Appended sub-scenario' : 'Generated draft'}: ${result.filePath}`);
    }
}
