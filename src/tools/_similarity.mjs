/**
 * 已知错误相似度匹配（Q3 方向 3，子任务 3.1）
 *
 * 当 specmate 遇到未知错误码时，在 29 篇已知错误文档中找最相似的 3 个作为
 * few-shot 示例，帮助 Agent 的 LLM 推理根因和修复方案。
 *
 * 算法：
 *   1. 错误码前缀匹配：P00xx 优先匹配 P00xx，G00xx 优先匹配 G00xx
 *   2. 关键词 Jaccard 相似度（基于错误信息中的关键词）
 *   3. 综合排序：前缀匹配得分 + Jaccard 得分
 */

import { collectErrorFiles, parseErrorFile } from '../db/parser.mjs';
import { readFileSync } from 'fs';

// ── Cached error knowledge for fast lookup ──
/** @type {Array<{code: string, title: string, phenomena: string, cause: string, solution: string, keywords: Set<string>}>} */
let _errorCache = null;

/**
 * Load and cache all known error documents
 */
function loadErrorCache() {
    if (_errorCache) return _errorCache;

    const paths = collectErrorFiles();
    _errorCache = [];

    for (const filePath of paths) {
        try {
            const content = readFileSync(filePath, 'utf-8');
            const err = parseErrorFile(content);
            if (err.code) {
                const allText = [err.title, err.phenomena, err.cause, err.solution, err.rules || '']
                    .join(' ')
                    .toLowerCase();
                // Tokenize into keywords (remove common words, keep BSV-specific terms)
                const tokens = allText
                    .replace(/[^a-z0-9\s#]/g, ' ')
                    .split(/\s+/)
                    .filter(t => t.length > 2 && !STOP_WORDS.has(t));

                _errorCache.push({
                    code: err.code,
                    title: err.title,
                    phenomena: err.phenomena,
                    cause: err.cause,
                    solution: err.solution,
                    keywords: new Set(tokens),
                });
            }
        } catch (_) { /* skip unparseable files */ }
    }

    return _errorCache;
}

/** Common English stop words to exclude from Jaccard similarity */
const STOP_WORDS = new Set([
    'the', 'and', 'for', 'not', 'are', 'can', 'has', 'use', 'with', 'that',
    'this', 'from', 'will', 'when', 'your', 'you', 'its', 'all', 'but',
    'have', 'been', 'was', 'one', 'how', 'then', 'also', 'may',
]);

/**
 * Extract keywords from unknown error message
 * @param {string} errorMsg
 * @returns {Set<string>}
 */
function extractKeywords(errorMsg) {
    const lower = errorMsg.toLowerCase();
    // Extract error codes: PXXXX, GXXXX, TXXXX, BSV-XXXX
    const codeMatches = [...lower.matchAll(/\b[pgbt]s?\s*-?\s*\d{4}\b/gi)];
    const codes = codeMatches.map(m => m[0].replace(/[^a-z0-9]/g, '').toLowerCase());

    // Extract BSV-specific terms
    const tokens = []
        .concat(codes)
        .concat(
            lower
                .replace(/[^a-z0-9\s#_]/g, ' ')
                .split(/\s+/)
                .filter(t => t.length > 2 && !STOP_WORDS.has(t))
        );

    return new Set(tokens);
}

/**
 * Calculate Jaccard similarity between two keyword sets
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} 0-1
 */
function jaccardSimilarity(a, b) {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const item of a) {
        if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return intersection / union;
}

/**
 * Find top 3 most similar known errors for an unknown error
 *
 * @param {string} errorCode - unknown error code (e.g., "P0099")
 * @param {string} errorMessage - full error message from bsc
 * @returns {Array<{code: string, title: string, phenomena: string, solution: string, score: number}>}
 */
export function findSimilarErrors(errorCode, errorMessage) {
    const cache = loadErrorCache();
    if (cache.length === 0) return [];

    const unknownKeywords = extractKeywords(errorMessage);
    const unknownPrefix = (errorCode || '').replace(/\d/g, '').toUpperCase();

    const scored = [];

    for (const err of cache) {
        // Skip exact match (handled by normal lookup)
        if (err.code === errorCode) continue;

        // 1. Prefix score: same error family (P/G/T) gets bonus
        const errPrefix = err.code.replace(/\d/g, '').toUpperCase();
        let prefixScore = 0;
        if (errPrefix === unknownPrefix) prefixScore = 0.3;
        else if (errPrefix[0] === unknownPrefix[0]) prefixScore = 0.1; // Same letter family

        // 2. Keyword Jaccard similarity (weighted higher)
        let jaccardScore = 0;
        if (unknownKeywords.size > 0) {
            jaccardScore = jaccardSimilarity(unknownKeywords, err.keywords);
        }

        // 3. Text overlap: check if error code or key terms appear in phenomena
        let textScore = 0;
        const lowerPhenomena = (err.phenomena || '').toLowerCase();
        const lowerTitle = (err.title || '').toLowerCase();
        for (const kw of unknownKeywords) {
            if (kw.length > 3 && (lowerPhenomena.includes(kw) || lowerTitle.includes(kw))) {
                textScore += 0.05;
            }
        }
        textScore = Math.min(textScore, 0.2);

        const totalScore = prefixScore * 0.3 + jaccardScore * 0.5 + textScore * 0.2;

        if (totalScore > 0) {
            scored.push({
                code: err.code,
                title: err.title,
                phenomena: err.phenomena,
                solution: err.solution,
                score: totalScore,
            });
        }
    }

    // Sort by score descending, take top 3
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3);
}

/**
 * Reset the error cache (for testing)
 */
export function resetSimilarityCache() {
    _errorCache = null;
}
