#!/usr/bin/env node
/**
 * generate-error-doc.mjs — Phase 1 auto-cluster draft generator
 *
 * Generates a Markdown error document from aggregated capture data.
 * Output goes to docs/errors/_drafts/<CODE>.md (not directly to docs/errors/).
 *
 * Behavior:
 *   - If docs/errors/<CODE>.md exists → new content appended as sub-scenario
 *   - If not → brand-new document generated
 *
 * Format: compatible with src/db/parser.mjs (bold-marker format).
 *
 * Usage (CLI):
 *   node scripts/generate-error-doc.mjs --code=P0030 --captures-json='[...]'
 *
 * Usage (programmatic):
 *   import { generateDraft, appendSubScenario } from './generate-error-doc.mjs';
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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
    const matches = content.match(/##\s+场景\s+(\d+):/g);
    if (!matches || matches.length === 0) return 1;
    // The main content counts as scenario 1, so sub-scenarios start at 2
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
    lines.push(`## \u573a\u666f ${scenarioNum}: ${summary}`);
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
 * @param {object} params
 * @param {string} params.code - error code
 * @param {number} params.totalRepeat - total repeat count
 * @param {number} params.sessionCount - session count
 * @param {string} params.samples - aggregated bsc_output
 * @param {string} params.latestCause - latest cause
 * @param {string} params.latestSolution - latest solution
 * @returns {{ filePath: string, isAppend: boolean }} path to generated draft and whether it was appended
 */
export function writeDraft({ code, totalRepeat, sessionCount, samples, latestCause, latestSolution }) {
    if (!existsSync(DRAFTS_DIR)) {
        mkdirSync(DRAFTS_DIR, { recursive: true });
    }

    const existingPath = join(ERRORS_DIR, `${code}.md`);
    const draftPath = join(DRAFTS_DIR, `${code}.md`);

    let content;
    let isAppend = false;

    if (existsSync(existingPath)) {
        const existingContent = readFileSync(existingPath, 'utf-8');
        content = appendSubScenario(existingContent, {
            code, totalRepeat, sessionCount, samples, latestCause, latestSolution
        });
        isAppend = true;
    } else {
        content = generateDraft({
            code, totalRepeat, sessionCount, samples, latestCause, latestSolution
        });
    }

    writeFileSync(draftPath, content, 'utf-8');
    return { filePath: draftPath, isAppend };
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
    console.log(`${result.isAppend ? 'Appended sub-scenario' : 'Generated draft'}: ${result.filePath}`);
}
