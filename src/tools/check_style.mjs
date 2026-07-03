import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { getLevel } from '../config.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function checkStyle(args) {
    const files = Array.isArray(args.files) ? args.files : [args.files];
    const results = [];

    for (const relPath of files) {
        const absPath = resolve(relPath);
        if (!existsSync(absPath)) {
            results.push({
                file: relPath,
                error: `File not found: ${relPath}`
            });
            continue;
        }
        const content = readFileSync(absPath, 'utf-8');
        results.push(...checkFile(relPath, content));
    }

    const level = getLevel();
    if (level === 'silicon') {
        return results.filter(r => r.severity === 'error');
    }
    return results;
}

function checkFile(filename, content) {
    const issues = [];
    const lines = content.split('\n');

    checkMethodOrder(filename, lines, issues);
    checkBoolOperators(filename, lines, issues);
    checkReservedWords(filename, lines, issues);
    checkRuleDoubleWrite(filename, content, issues);
    checkVecUsage(filename, lines, issues);

    return issues;
}

function checkMethodOrder(filename, lines) {
    let lastRuleLine = -1;
    let firstMethodLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (/^(rule\s|\(\*.*\*\)\s*rule\s)/.test(trimmed)) {
            lastRuleLine = i;
        }
        if (/^\s*(method\s|\(\*.*\*\)\s*method\s)/.test(trimmed) && firstMethodLine === -1) {
            firstMethodLine = i;
        }
    }

    if (firstMethodLine !== -1 && lastRuleLine > firstMethodLine) {
        issues.push({
            file: filename,
            line: firstMethodLine + 1,
            check: 'P0032',
            severity: 'error',
            message: 'method 出现在 rule 之前 — 所有 method 必须在所有 rule 之后',
            suggestion: '将 method 移到文件末尾，所有 rule 之后'
        });
    }
}

function checkBoolOperators(filename, lines) {
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) continue;

        if (/~(\s*)(wave|flag|done|ready|valid|busy|start|enable|ack|hit|ok|empty|full|notEmpty|notFull|reg\w*|r\w*|b\w*)/
            .test(trimmed)) {
            issues.push({
                file: filename,
                line: i + 1,
                check: 'T0061',
                severity: 'warning',
                message: `可能对 Bool 类型使用了位取反 ~，应改用逻辑取反 !`,
                suggestion: `改为 !${trimmed.match(/~\s*(\w+)/)[1]}`
            });
        }
        if (/(=&|!=&)/.test(trimmed)) {
            // 不精确，跳过
        }
    }
}

const SV_RESERVED = new Set([
    'action', 'bit', 'byte', 'reg', 'wire', 'module',
    'input', 'output', 'inout', 'assign', 'always', 'initial',
    'posedge', 'negedge', 'case', 'default', 'endcase', 'begin', 'end',
    'function', 'task', 'class', 'interface', 'package', 'import',
    'parameter', 'localparam', 'specify', 'primitive', 'priority'
]);

function checkReservedWords(filename, lines) {
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) continue;
        if (trimmed.startsWith('import ')) continue;
        if (trimmed.startsWith('*')) continue;

        const words = trimmed.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
        for (const word of words) {
            if (SV_RESERVED.has(word.toLowerCase()) &&
                !/(endmodule|endpackage|endinterface|endfunction|endrule|endmethod|endclass)/.test(trimmed)) {
                const isKeywordContext = (
                    trimmed.includes(`\`${word}`) ||
                    trimmed.startsWith(`${word} `) ||
                    trimmed.includes(` ${word}`)
                );
                if (!isKeywordContext) {
                    issues.push({
                        file: filename,
                        line: i + 1,
                        check: 'P0005',
                        severity: 'warning',
                        message: `标识符 "${word}" 是 SystemVerilog/BSV 保留字，可能导致编译错误`,
                        suggestion: `改名避免冲突`
                    });
                }
            }
        }
    }
}

function checkRuleDoubleWrite(filename, content) {
    const ruleBlocks = content.match(/rule\s+\w+[\s\S]*?endrule/g) || [];

    for (const ruleBlock of ruleBlocks) {
        const regWrites = {};
        const writeMatches = ruleBlock.matchAll(/(\w+)\s*<=\s*/g);
        for (const m of writeMatches) {
            const reg = m[1];
            if (regWrites[reg] === undefined) {
                regWrites[reg] = 1;
            } else {
                const ruleName = ruleBlock.match(/rule\s+(\w+)/)[1];
                const lineEstimate = content.substring(0, content.indexOf(ruleBlock)).split('\n').length + 1;
                issues.push({
                    file: filename,
                    line: lineEstimate,
                    check: 'G0004',
                    severity: 'error',
                    message: `Rule "${ruleName}" 内对 "${reg}" 写入多次`,
                    suggestion: '同一 rule 内每个寄存器只能写入一次。检查 case default 分支。'
                });
                break;
            }
        }
    }
}

function checkVecUsage(filename, lines, issues) {
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('import ')) continue;
        if ((/=\s*vec\s*\(/.test(trimmed) || /\bvec\s*\(\s*\d/.test(trimmed)) &&
            !trimmed.includes('Vector')) {
            issues.push({
                file: filename,
                line: i + 1,
                check: 'T0004',
                severity: 'warning',
                message: '`vec()` 在 BSC 2025.07 标准库中不可用',
                suggestion: '用 genWith(fromInteger) 或显式 genWith(fn) 替代'
            });
        }
    }
}

// Common variable names that are likely Bool (heuristic)
const BOOL_LIKE = new Set([
    'wave', 'flag', 'done', 'ready', 'valid', 'busy',
    'start', 'enable', 'ack', 'hit', 'ok',
    'notEmpty', 'notFull', 'idle', 'active'
]);
