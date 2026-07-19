/**
 * 源码上下文提取（Q3 方向 3，子任务 3.2 + 3.3）
 *
 * 当 specmate 遇到未知错误码时：
 *   1. 提取错误行 ±10 行源码上下文
 *   2. 利用 tree-sitter 定位到最近的 rule/method/function 边界
 *   3. 拼装未知错误响应模板（已知错误对比 + few-shot 示例 + LLM 推理引导）
 */

import { readFileSync, existsSync } from 'fs';
import { parseFile } from './ast_query.mjs';

/**
 * Extract source code context around a specific line
 *
 * @param {string} filePath - absolute path to .bsv file
 * @param {number} targetLine - 1-indexed line number
 * @param {number} contextLines - lines before and after the target line (default 10)
 * @returns {{ text: string, startLine: number, endLine: number }|null} formatted code block with line numbers, or null if file not found/targetLine out of range
 */
export function extractSourceContext(filePath, targetLine, contextLines = 10) {
    if (!existsSync(filePath)) return null;

    let source;
    try {
        source = readFileSync(filePath, 'utf-8');
    } catch (_) {
        return null;
    }

    const lines = source.split('\n');
    if (targetLine < 1 || targetLine > lines.length) return null;

    const startLine = Math.max(1, targetLine - contextLines);
    const endLine = Math.min(lines.length, targetLine + contextLines);

    // Attempt to locate nearest rule/method/function boundary using tree-sitter
    let boundaryStart = startLine;
    let boundaryEnd = endLine;
    try {
        const ast = parseFile(filePath);
        if (ast) {
            const boundary = findNearestBoundary(ast, targetLine);
            if (boundary) {
                // Extend context to include the boundary
                boundaryStart = Math.min(startLine, boundary.startLine);
                boundaryEnd = Math.max(endLine, boundary.endLine);
            }
        }
    } catch (_) { /* tree-sitter is non-critical for context extraction */ }

    // Format output with line numbers
    const formattedLines = [];
    for (let i = boundaryStart; i <= boundaryEnd; i++) {
        const marker = i === targetLine ? '>>>' : '   ';
        const lineNum = String(i).padStart(4, ' ');
        formattedLines.push(`${marker} ${lineNum} | ${lines[i - 1]}`);
    }

    return {
        text: formattedLines.join('\n'),
        startLine: boundaryStart,
        endLine: boundaryEnd,
        targetLine,
        filePath,
    };
}

/**
 * Find the nearest enclosing rule/method/function in the AST around a line
 * @param {object} ast - tree-sitter parse result
 * @param {number} targetLine
 * @returns {{ startLine: number, endLine: number }|null}
 */
function findNearestBoundary(ast, targetLine) {
    if (!ast || !ast.rootNode) return null;

    // Search for rule definition, method definition, or function definition nodes
    // that enclose the target line
    const enclosingNodes = [];

    function search(node) {
        if (!node) return;

        const nodeType = node.type || '';
        // BSV grammar node types for rule/method/function boundaries
        if (
            nodeType === 'rule_definition' ||
            nodeType === 'method_definition' ||
            nodeType === 'function_definition' ||
            nodeType === 'function_item' ||
            nodeType === 'module_definition'
        ) {
            enclosingNodes.push({
                startLine: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                type: nodeType,
                distance: Math.abs(node.startPosition.row + 1 - targetLine) +
                         Math.abs(node.endPosition.row + 1 - targetLine),
            });
        }

        for (let i = 0; i < node.childCount; i++) {
            search(node.child(i));
        }
    }

    search(ast.rootNode);

    // Return the closest enclosing node
    if (enclosingNodes.length === 0) return null;
    enclosingNodes.sort((a, b) => a.distance - b.distance);
    return enclosingNodes[0];
}

// ─── Unknown error response template (子任务 3.3) ───────────────────────────

/**
 * Build a standard unknown error response for the Agent
 *
 * The template includes:
 *   (a) Source code context around the error line
 *   (b) Top-3 most similar known errors as few-shot examples
 *   (c) A guided prompt directing Agent's LLM to analyze and capture
 *
 * @param {object} opts
 * @param {string} opts.errorCode - unknown error code
 * @param {string} opts.errorMessage - full error message from bsc
 * @param {Array<{code:string,title:string,phenomena:string,solution:string,score:number}>} opts.similarErrors - from findSimilarErrors()
 * @param {object|null} opts.sourceContext - from extractSourceContext()
 * @returns {string} formatted response text
 */
export function buildUnknownErrorResponse({ errorCode, errorMessage, similarErrors = [], sourceContext = null }) {
    const lines = [];

    lines.push('---');
    lines.push(`### ⚠ 未知错误码: \`${errorCode}\``);
    lines.push('');
    lines.push('**specmate 知识库中未收录此错误。** 以下是根据已有知识整理的上下文，请使用你自己的 LLM 推理能力分析根因：');
    lines.push('');

    // (a) Source code context
    if (sourceContext && sourceContext.text) {
        lines.push('---');
        lines.push('### 📍 源码上下文');
        lines.push('');
        lines.push(`文件: \`${sourceContext.filePath}\``);
        lines.push(`错误行: ${sourceContext.targetLine}`);
        lines.push('```bsv');
        lines.push(sourceContext.text);
        lines.push('```');
        lines.push('');
    }

    // (b) Few-shot: most similar known errors
    if (similarErrors.length > 0) {
        lines.push('---');
        lines.push('### 📚 最相似的已知错误 (作为分析参考)');
        lines.push('');

        for (let i = 0; i < similarErrors.length; i++) {
            const se = similarErrors[i];
            lines.push(`**${i + 1}. \`${se.code}\`** — ${se.title}`);
            lines.push('');
            if (se.phenomena) {
                lines.push(`现象: ${se.phenomena}`);
                lines.push('');
            }
            if (se.solution) {
                lines.push(`解决方案: ${se.solution}`);
                lines.push('');
            }
        }
    }

    // (c) LLM analysis guidance
    lines.push('---');
    lines.push('### 🤖 请分析以下错误');
    lines.push('');
    lines.push(`BSC 编译器报错: \`${errorMessage}\``);
    lines.push('');
    lines.push('请基于以上源码上下文和已知错误参考，分析并判断：');
    lines.push('1. **根因**: 这个错误最可能是什么原因导致的？');
    lines.push('2. **修复方案**: 具体应该如何修改代码？');
    lines.push('');
    lines.push('分析完成后，请调用以下两个工具记录你的发现：');
    lines.push('- `specmate_capture(code="${errorCode}", ...)` — 将错误码、根因、修复方案入库');
    lines.push('- `specmate_resolve(code="${errorCode}", ...)` — 确认修复后固化经验');
    lines.push('');
    lines.push('这样当下次同样的错误码出现时，specmate 可以直接提供已知的修复方案。');

    return lines.join('\n');
}
