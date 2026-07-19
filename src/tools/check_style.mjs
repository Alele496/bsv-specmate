import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { getLevel, LEVEL_LIMITS } from '../config.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── 架构说明 ──
// check_style.mjs 是 specmate 的"快速第一遍扫描"层。
// 所有 19 条规则使用正则实现，不依赖 tree-sitter AST 解析器。
//
// 原因：
// 1. 正则兼容残缺/格式错误的代码（tree-sitter 解析在语法错误时会失败）
// 2. 正则秒出结果，适合 Agent 编码过程中频繁调用
// 3. 大部分规则 BSC 编译器最终也会报——specmate 的价值是"提前"和"友好"
//
// 与 ast_query.mjs 的关系：
// - ast_query.mjs 用 tree-sitter 做深度分析（调度冲突/依赖图/寄存器追踪）
// - check_style.mjs 不做深度分析——那是 specmate_analyze 的工作
// - 两者是互补的：check_style = 快速 lint，ast_query = 深度审查
//
// 与 preflight.mjs 的关系：
// - preflight.mjs 用 tree-sitter 覆盖 6 条高频规则（P0030/P0005/G0004/G0005/G0053/T0043）
// - 与 check_style 有部分规则重叠，但实现技术不同
// - preflight 由 specmate_scan/specmate_guide(pre_code) 自动调用
//
// 议会决议（2026-07-18）：不将正则规则重写为 tree-sitter。
// 而是加 confidence 字段让 Agent 知道每个规则的"可信度"。
// 精力投入到 TRAPS 扩充而非静态分析精度提升。

export function checkStyle(args) {
    const files = Array.isArray(args.files) ? args.files : [args.files];
    const full = args.full === true;
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
        results.push(...checkFile(relPath, content, full));
    }

    const level = getLevel();
    if (LEVEL_LIMITS[level].mode === 'passive') {
        return results.filter(r => r.severity === 'error');
    }
    return results;
}

function checkFile(filename, content, full = false) {
    const issues = [];
    const lines = content.split('\n');

    // Always-on: BSC 覆盖不到的语义规则 + 议会恢复的高频拦截规则
    checkLiteralOverflow(filename, lines, issues);   // 位宽溢出 — BSC 可能不精确
    checkSizedLiteralZero(filename, lines, issues);   // 零位宽 — 边界情况
    checkBoolOperators(filename, lines, issues);      // Bool 位取反 — 语义错误
    checkG0053(filename, lines, issues);              // mkReg 动态参数 — G0053 风险
    checkMultiSubmodule(filename, content, issues);   // rule 内多子模块冲突 — G0004
    checkVecUsage(filename, lines, issues);           // vec() 用法 — T0004
    checkBoolBitMismatch(filename, lines, issues);    // Bool 位拼接 — T0061
    checkValueMethodSyntax(filename, lines, issues);  // value method 语法 — P0030
    checkInterfaceBoolReturn(filename, content, issues);  // interface method Bool 返回 — 2026-07-14
    checkAlwaysAttrMisuse(filename, content, issues);     // always_ready/enabled 滥用 — 2026-07-14
    checkP0022AttrOnMethod(filename, lines, issues);      // (* always_enabled *) pragma on module method → P0022

    // Full-scan: 仅在显式 full=true 时启用
    if (full) {
        checkRuleDoubleWrite(filename, content, issues);   // WAW — BSC 发现但不精确
        checkDupTypeParams(filename, lines, issues);
        checkDupAttr(filename, lines, issues);
        checkUrgencyCycle(filename, content, issues);
        checkAttrBadRule(filename, content, issues);
        checkArgCountMismatch(filename, lines, issues);
        checkBVIScheduleGroupSyntax(filename, content, issues);       // P0200 — BVI schedule 分组语法
        checkSynthesizeAnnotationOrder(filename, content, issues);    // G0010 — urgency 在 synthesize 之后
        // 以下 BSC 100% 覆盖，不再默认：
        // checkMethodOrder, checkReservedWords, checkMethodRegNaming,
        // checkDupValueParams, checkDupInterfaceMembers, checkStructField
    }

    return issues;
}

function checkMethodOrder(filename, lines, issues) {
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

function collectBoolNames(content) {
    const names = new Set();
    // Reg#(Bool) regName <-
    for (const m of content.matchAll(/Reg#\(\s*Bool\s*\)\s+(\w+)\s*<-/g)) {
        names.add(m[1]);
    }
    // Bool localName = or Bool localName;
    for (const m of content.matchAll(/\bBool\s+(\w+)\s*[=;)]/g)) {
        names.add(m[1]);
    }
    // function/method parameter: (Bool paramName
    for (const m of content.matchAll(/\(\s*Bool\s+(\w+)/g)) {
        names.add(m[1]);
    }
    return names;
}

function checkBoolOperators(filename, lines, issues) {
    const content = lines.join('\n');
    const boolNames = collectBoolNames(content);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) continue;

        const matches = [...trimmed.matchAll(/~\s*(\w+)/g)];
        for (const match of matches) {
            const varName = match[1];

            // Only flag if we've confirmed this is a Bool variable
            if (boolNames.has(varName)) {
                issues.push({
                    file: filename,
                    line: i + 1,
                    check: 'T0061',
                    severity: 'warning',
                    confidence: 'high',
                    message: `对 Bool 变量 "${varName}" 使用了位取反 ~，应改用逻辑取反 !`,
                    suggestion: `改为 !${varName}`
                });
            }
        }
    }
}

// BSV language-structure keywords: these appear as identifiers only
// when NOT at column 0. At line-start they are legitimate BSV syntax.
const BSV_KEYWORDS = new Set([
    'module', 'endmodule', 'interface', 'endinterface',
    'rule', 'endrule', 'method', 'endmethod',
    'function', 'endfunction', 'begin', 'end',
    'case', 'endcase', 'default', 'import',
    'endpackage', 'endclass'
]);

// Pure SV reserved words — never valid as BSV identifiers.
// See docs/reference/keywords.md for the canonical list.
const SV_ONLY = new Set([
    'input', 'output', 'inout', 'reg', 'wire',
    'bit', 'byte', 'assign', 'always', 'initial',
    'posedge', 'negedge', 'specify', 'primitive',
    'priority', 'action', 'class', 'package',
    'task', 'parameter', 'localparam',
    // SV gate primitives
    'buf', 'bufif0', 'bufif1',
    'not', 'and', 'nand', 'or', 'nor', 'xor', 'xnor'
]);

function emitIfReserved(word, idx, cleaned, filename, lineNum, issues) {
    // BSV is case-sensitive — PascalCase identifiers (Action, Bit, Reg) are valid
    // types and must not be flagged as matching their lowercase keyword equivalents.
    // Only flag words that are actually lowercase (matching the reserved word exactly).
    if (word !== word.toLowerCase()) return;

    if (BSV_KEYWORDS.has(word)) {
        // At column 0 = legitimate BSV syntax (e.g. "module mkFoo")
        if (idx === 0) return;
    } else if (SV_ONLY.has(word)) {
        // SV-only word used as identifier — proceed to report
    } else {
        return;
    }

    // Skip if the word is used as a BSV type parameter (e.g. Bit in Bit#(8))
    const after = cleaned.slice(idx + word.length);
    if (/^\s*#\s*\(/.test(after)) return;

    issues.push({
        file: filename,
        line: lineNum + 1,
        check: 'P0005',
        severity: 'warning',
        message: `标识符 "${word}" 是 SystemVerilog/BSV 保留字，可能导致编译错误`,
        suggestion: `改名避免冲突`
    });
}

function checkReservedWords(filename, lines, issues) {
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) continue;
        if (trimmed.startsWith('import ')) continue;
        if (trimmed.startsWith('*')) continue;

        // Strip inline comments and string literals to avoid false positives
        const cleaned = trimmed
            .replace(/\/\/.*$/, '')       // remove inline comments
            .replace(/"([^"\\]|\\.)*"/g, '""'); // remove string literals

        const wordRe = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
        let m;
        while ((m = wordRe.exec(cleaned)) !== null) {
            const word = m[0];

            // Check the whole word (case-sensitive — BSV is case-sensitive)
            emitIfReserved(word, m.index, cleaned, filename, i, issues);
        }
    }
}

function checkMultiSubmodule(filename, content, issues) {
    const blocks = content.match(/rule\s+\w+[\s\S]*?endrule/g) || [];
    for (const block of blocks) {
        const mods = new Set();
        const matches = block.matchAll(/\b(\w+)\.(\w+)\s*\(/g);
        const skip = new Set(['if', 'else', 'begin', 'end', 'case', 'endcase', 'return']);
        for (const m of matches) {
            if (!skip.has(m[1]) && !skip.has(m[2])) {
                mods.add(m[1]);
            }
        }
        if (mods.size >= 2) {
            const ruleName = (block.match(/rule\s+(\w+)/) || [])[1] || 'unknown';
            const lineEst = content.substring(0, content.indexOf(block)).split('\n').length + 1;
            issues.push({
                file: filename, line: lineEst, check: 'G0004_FSM',
                severity: 'warning',
                confidence: 'high',
                message: `Rule "${ruleName}" 内调用了 ${mods.size} 个子模块 (${[...mods].join(', ')}) — 可能触发 G0004`,
                suggestion: '拆为独立规则，每个规则只调一个子模块。见 lookup_ref(topic="schedule")'
            });
        }
    }
}

function checkRuleDoubleWrite(filename, content, issues) {
    const ruleBlocks = content.match(/rule\s+\w+[\s\S]*?endrule/g) || [];

    for (const ruleBlock of ruleBlocks) {
        const regWrites = {};
        const writeMatches = ruleBlock.matchAll(/(\w+)\s*<=\s*/g);
        for (const m of writeMatches) {
            const reg = m[1];
            if (regWrites[reg] === undefined) {
                regWrites[reg] = 1;
            } else {
                // Check if this is a false positive: case(reg) FSM pattern
                // where all writes to 'reg' are within case branches.
                if (isCaseFsmPattern(ruleBlock, reg)) {
                    continue; // Skip — mutually exclusive writes via case branches
                }

                const ruleName = ruleBlock.match(/rule\s+(\w+)/)[1];
                const lineEstimate = content.substring(0, content.indexOf(ruleBlock)).split('\n').length + 1;
                issues.push({
                    file: filename,
                    line: lineEstimate,
                    check: 'G0004',
                    severity: 'warning',
                    confidence: 'medium',
                    message: `同一寄存器有多次 \`<=\` 赋值 — 如果在不同互斥 case 分支中，BSC 可正确处理；如果在同一无条件路径中会触发 G0004`,
                    suggestion: '检查是否是 case/if 分支导致的重复检测。如果是真正多次写入，拆分寄存器或拆分为独立 rule。'
                });
                break;
            }
        }
    }
}

/**
 * Check if multiple writes to `regName` are all inside a `case(regName)` block.
 * This is the standard BSV FSM pattern — each case branch is mutually exclusive,
 * so the writes are not truly conflicting. BSC handles this correctly.
 * Returns true if: (a) there is a case(regName) block, and (b) ALL <= writes
 * to regName within this rule fall inside that case block.
 */
export function isCaseFsmPattern(ruleBlock, regName) {
    // Find all case(expr) ... endcase blocks
    // Use a loop to handle multiple case blocks (though typically there's one per FSM rule)
    const caseBlockRe = /case\s*\((\w+)\)([\s\S]*?)endcase/g;
    let caseMatch;

    while ((caseMatch = caseBlockRe.exec(ruleBlock)) !== null) {
        if (caseMatch[1] !== regName) continue;

        // Found case(regName) — verify all writes to regName are inside it
        const caseStartIdx = caseMatch.index;
        const caseEndIdx = caseStartIdx + caseMatch[0].length;

        const writeRe = new RegExp(`\\b${regName}\\s*<=\\s*`, 'g');
        let writeMatch;
        let allInsideCase = true;

        while ((writeMatch = writeRe.exec(ruleBlock)) !== null) {
            if (writeMatch.index < caseStartIdx || writeMatch.index > caseEndIdx) {
                allInsideCase = false;
                break;
            }
        }

        if (allInsideCase) return true;
    }

    return false;
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
                confidence: 'medium',
                message: '`vec()` 在 BSC 2025.07 标准库中不可用',
                suggestion: '用 genWith(fromInteger) 或显式 genWith(fn) 替代'
            });
        }
    }
}

function checkBoolBitMismatch(filename, lines, issues) {
    const linesJoined = lines.join('\n');
    const boolRegs = [];
    const regPattern = /Reg#\(Bool\)\s+(\w+)\s*<-/g;
    let m;
    while ((m = regPattern.exec(linesJoined)) !== null) {
        boolRegs.push(m[1]);
    }

    for (const reg of boolRegs) {
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('//')) continue;

            if (new RegExp(`}=\\s*\\{.*\\b${reg}\\b.*\\}\\s*;`).test(trimmed) ||
                new RegExp(`return\\s*\\{.*\\b${reg}\\b.*\\}`).test(trimmed)) {
                issues.push({
                    file: filename, line: i + 1, check: 'T0061',
                    severity: 'warning',
                    confidence: 'medium',
                    message: `Reg#(Bool) "${reg}" 用于位拼接 { } — Bool 不能拼入 Bit 表达式`,
                    suggestion: `将 "${reg}" 改为 Reg#(Bit#(1))，或改用 Bool 逻辑而非位拼接`
                });
            }
        }
    }
}

function checkValueMethodSyntax(filename, lines, issues) {
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//')) continue;
        if (/^\s*method\s+(?!Action\b)\S+/.test(trimmed) && !trimmed.includes('=') && trimmed.endsWith(';')) {
            const nextLines = lines.slice(i, i + 8).join('\n');
            if (/\bif\b.*\breturn\b/.test(nextLines) || /\bcase\b.*\breturn\b/.test(nextLines)) {
                issues.push({
                    file: filename, line: i + 1, check: 'P0030',
                    severity: 'warning',
                    confidence: 'high',
                    message: 'Value method 使用 if-return — BSV 要求用 = expr 或 ?: 三元链',
                    suggestion: '改为 method Type name = (cond) ? a : b; 或提取 function'
                });
            }
        }
    }
}

function checkMethodRegNaming(filename, content, issues) {
    const regNames = [...content.matchAll(/Reg#\(\w+\)\s+(\w+)\s*<-/g)].map(m => m[1]);
    const methodNames = [...content.matchAll(/method\s+\S+\s+(\w+)\s*[=;]/g)].map(m => m[1]);
    const overlapping = regNames.filter(r => methodNames.includes(r));
    for (const name of overlapping) {
        const i = content.split('\n').findIndex(l => l.includes(`method`) && l.includes(name));
        if (i >= 0) {
            issues.push({
                file: filename, line: i + 1, check: 'T0011',
                severity: 'warning',
                message: `方法名 "${name}" 与寄存器重名，可能触发消歧义错误`,
                suggestion: `寄存器改名为 ${name}_reg，方法保持不变`
            });
        }
    }
}

function checkLiteralOverflow(filename, lines, issues) {
    const p = /\b(\d+)\s*'\s*([bdh])\s*([0-9a-fA-FxXzZ?_]+)\b/g;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//')) continue;
        const matches = [...trimmed.matchAll(p)];
        for (const m of matches) {
            const width = parseInt(m[1], 10);
            const radix = m[2];
            const rawVal = m[3].replace(/[xXzZ?_]/g, '0');
            let val;
            const isNeg = trimmed.charAt(m.index - 1) === '-' || /^-\s*'/.test(m[0]);
            try {
                if (radix === 'd') {
                    val = BigInt(rawVal);
                } else if (radix === 'h') {
                    val = BigInt('0x' + rawVal);
                } else {
                    val = BigInt('0b' + rawVal);
                }
                if (isNeg) val = -val;
            } catch (_) { continue; }

            if (width === 0) continue;

            const max = (BigInt(1) << BigInt(width)) - BigInt(1);
            const min = -(BigInt(1) << BigInt(width - 1));
            const msbOnly = BigInt(1) << BigInt(width - 1);
            const negVal = val < 0n;

            if (!negVal && val > max) {
                const bitsNeeded = val.toString(2).length;
                issues.push({
                    file: filename, line: i + 1, check: 'T0132',
                    severity: 'warning',
                    confidence: 'high',
                    message: `字面量 ${m[0]} 值 ${val} 需要 ${bitsNeeded} bits，但声明位宽仅 ${width} bits`,
                    suggestion: `最大值 ${max}，减少字面量值或增到位宽 Bit#(${bitsNeeded})`
                });
            }
            if (negVal && val < min) {
                issues.push({
                    file: filename, line: i + 1, check: 'T0132',
                    severity: 'warning',
                    confidence: 'high',
                    message: `负字面量 ${m[0]} 超出 ${width}-bit 有符号范围 [${min}, ${max}]`,
                    suggestion: `扩大位宽或使用无符号字面量`
                });
            }
        }
    }
}

function checkDupTypeParams(filename, lines, issues) {
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//')) continue;

        const hp = trimmed.match(/#\s*\(([^)]+)\)/);
        if (!hp) continue;
        const params = hp[1].match(/\btype\s+([a-zA-Z_]\w*)\b/g);
        if (!params) continue;
        const names = params.map(p => p.replace(/^type\s+/, ''));
        const seen = new Map();
        for (const n of names) {
            seen.set(n, (seen.get(n) || 0) + 1);
        }
        for (const [n, c] of seen) {
            if (c > 1) {
                issues.push({
                    file: filename, line: i + 1, check: 'P0073',
                    severity: 'info',
                    confidence: 'low',
                    message: `类型参数 "${n}" 在 #(...) 中重复定义`,
                    suggestion: `每个 type 参数必须唯一，删除重复的 "${n}"`
                });
                break;
            }
        }
    }
}

function checkDupValueParams(filename, lines, issues) {
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//')) continue;

        const fp = trimmed.match(/\bfunction\s+.*?\(([^)]*)\)/);
        if (!fp) continue;
        const args = fp[1];
        if (!args) continue;
        const names = [];
        const parts = args.split(',');
        for (const part of parts) {
            const m = part.trim().match(/\b([a-zA-Z_]\w*)\s*$/);
            if (m && m[1] !== 'provisos') names.push(m[1]);
        }
        const seen = new Map();
        for (const n of names) { seen.set(n, (seen.get(n) || 0) + 1); }
        for (const [n, c] of seen) {
            if (c > 1) {
                issues.push({
                    file: filename, line: i + 1, check: 'P0073',
                    severity: 'error',
                    message: `函数参数 "${n}" 在 function 签名中重复`,
                    suggestion: `每个参数名必须唯一，重命名其中一个 "${n}"`
                });
                break;
            }
        }
    }
}

function checkDupInterfaceMembers(filename, content, issues) {
    const ifcBlocks = content.match(/interface\s+\w+[\s\S]*?endinterface/g) || [];
    for (const block of ifcBlocks) {
        const methods = [...block.matchAll(/method\s+(?:\w+\s+)?(\w+)\s*[\(;]/g)].map(m => m[1]);
        const seen = new Map();
        for (const m of methods) { seen.set(m, (seen.get(m) || 0) + 1); }
        for (const [m, c] of seen) {
            if (c > 1) {
                const lineEst = content.substring(0, content.indexOf(block)).split('\n').length + 1;
                issues.push({
                    file: filename, line: lineEst, check: 'P0073',
                    severity: 'error',
                    message: `接口方法 "${m}" 在同一个 interface 块中声明了 ${c} 次`,
                    suggestion: `删除重复的 method 声明`
                });
                break;
            }
        }
    }
}

function checkDupAttr(filename, lines, issues) {
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//')) continue;

        const am = trimmed.match(/\(\*\s*([^)]+?)\s*\*\)/);
        if (!am) continue;
        const attrs = am[1].split(/\s*,\s*/g);
        const keys = attrs.map(a => a.replace(/\s*=\s*\S+/, '').trim());
        const seen = new Map();
        for (const k of keys) {
            if (!k) continue;
            seen.set(k, (seen.get(k) || 0) + 1);
        }
        for (const [k, c] of seen) {
            if (c > 1) {
                issues.push({
                    file: filename, line: i + 1, check: 'P0085',
                    severity: 'info',
                    confidence: 'low',
                    message: `属性 "${k}" 在同一 (* *) 中重复`,
                    suggestion: `删除重复的属性 "${k}"`
                });
                break;
            }
        }
        if (/\bsynthesized\b/.test(am[1])) {
            issues.push({
                file: filename, line: i + 1, check: 'P0085',
                severity: 'info',
                confidence: 'low',
                message: `属性 "synthesized" 是拼写错误，应为 "synthesize"`,
                suggestion: `改为 (* synthesize *)`
            });
        }
    }
}

function checkUrgencyCycle(filename, content, issues) {
    const declarations = [];
    const urgencyRe = /(?:descending_urgency|execution_order|preempts)\s*=\s*"([^"]+)"/g;
    let um;
    while ((um = urgencyRe.exec(content)) !== null) {
        const rules = um[1].split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
        declarations.push(rules);
        for (const r of rules) {
            if (rules.filter(x => x === r).length > 1) {
                const lineEst = content.substring(0, um.index).split('\n').length + 1;
                issues.push({
                    file: filename, line: lineEst, check: 'G0030',
                    severity: 'info',
                    confidence: 'low',
                    message: `urgency 声明中规则 "${r}" 在同一组内重复引用 — 形成自环 (G0040)`,
                    suggestion: `从 descending_urgency 中移除重复的 "${r}"`
                });
                break;
            }
        }
    }

    const edges = new Map();
    for (const rules of declarations) {
        for (let j = 0; j < rules.length - 1; j++) {
            const from = rules[j];
            const to = rules[j + 1];
            if (!edges.has(from)) edges.set(from, []);
            edges.get(from).push(to);
        }
    }

    function hasCycle(node, visited, stack) {
        if (stack.has(node)) return true;
        if (visited.has(node)) return false;
        visited.add(node);
        stack.add(node);
        for (const next of (edges.get(node) || [])) {
            if (hasCycle(next, visited, stack)) return true;
        }
        stack.delete(node);
        return false;
    }

    const visited = new Set();
    for (const node of edges.keys()) {
        if (hasCycle(node, visited, new Set())) {
            const idx = content.indexOf('descending_urgency');
            const lineEst = idx >= 0 ? content.substring(0, idx).split('\n').length + 1 : 1;
            issues.push({
                file: filename, line: lineEst, check: 'G0030',
                severity: 'info',
                confidence: 'low',
                message: `descending_urgency 形成循环依赖，涉及规则 "${node}"`,
                suggestion: `检查所有 descending_urgency 声明，消除循环`
            });
            break;
        }
    }
}

function checkAttrBadRule(filename, content, issues) {
    // Collect rule names
    const ruleNames = new Set([
        ...content.matchAll(/\brule\s+(["\\].*?["\\]|\w+)/g)
    ].map(m => m[1].replace(/["\\]/g, '')));
    // Also collect method declaration names — they can appear in urgency annotations
    // Pattern: method [Type] name( or method [Type] name;
    for (const m of content.matchAll(/\bmethod\s+(?:\w+(?:#\([^)]*\))?\s+)?(\w+)\s*[\(;]/g)) {
        ruleNames.add(m[1]);
    }

    const urgencyRe = /(?:descending_urgency|execution_order|preempts)\s*=\s*"([^"]+)"/g;
    let um;
    while ((um = urgencyRe.exec(content)) !== null) {
        const rules = um[1].split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
        for (const r of rules) {
            if (!ruleNames.has(r) && /^\w/.test(r)) {
                const lineEst = content.substring(0, um.index).split('\n').length + 1;
                issues.push({
                    file: filename, line: lineEst, check: 'G0054',
                    severity: 'info',
                    confidence: 'low',
                    message: `属性引用的规则 "${r}" 在文件中未定义`,
                    suggestion: `检查规则名拼写，或确认该规则已在本模块中声明`
                });
            }
        }
    }
}

function checkStructField(filename, content, issues) {
    const structDefs = new Map();
    const defRe = /typedef\s+struct\s*\{([^}]*)\}\s+(\w+)/g;
    let dm;
    while ((dm = defRe.exec(content)) !== null) {
        const body = dm[1];
        const name = dm[2];
        const fields = [...body.matchAll(/(?:\w+(?:#\([^)]*\))?\s+)+\b(\w+)\s*;/g)].map(m => m[1]);
        if (fields.length > 0) structDefs.set(name, new Set(fields));
    }

    const litRe = /(\w+)\s*\{\s*([^}]+)\s*\}/g;
    let lm;
    while ((lm = litRe.exec(content)) !== null) {
        const typeName = lm[1];
        const body = lm[2];
        if (!structDefs.has(typeName)) continue;
        const validFields = structDefs.get(typeName);
        const fieldNames = [...body.matchAll(/(?:^\s*|\s*,\s*)(\w+)\s*[:=]/g)].map(m => m[1]);
        for (const f of fieldNames) {
            if (!validFields.has(f)) {
                const lineEst = content.substring(0, lm.index).split('\n').length + 1;
                const near = [...validFields].slice(0, 5).join(', ');
                issues.push({
                    file: filename, line: lineEst, check: 'T0016',
                    severity: 'error',
                    message: `结构体 "${typeName}" 不存在字段 "${f}"，可用字段: ${near}`,
                    suggestion: `检查字段名拼写，或使用正确的结构体类型`
                });
            }
        }
    }
}

function checkArgCountMismatch(filename, lines, issues) {
    const funcDefs = new Map();
    const defRe = /\bfunction\s+(?:\w+(?:#\([^)]*\))?\s+)?(\w+)\s*\(([^)]*)\)/g;
    const joined = lines.join('\n');
    let dm;
    while ((dm = defRe.exec(joined)) !== null) {
        const name = dm[1];
        const params = dm[2].trim();
        if (params === '') { funcDefs.set(name, 0); continue; }
        funcDefs.set(name, params.split(',').length);
    }

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('function')) continue;

        const callRe = /\b(\w+)\s*\(([^)]*)\)/g;
        let cm;
        while ((cm = callRe.exec(trimmed)) !== null) {
            const name = cm[1];
            const args = cm[2].trim();
            if (!funcDefs.has(name)) continue;
            const expected = funcDefs.get(name);
            const actual = args === '' ? 0 : args.split(',').length;
            if (actual !== expected && !trimmed.startsWith(name + ' ')) {
                issues.push({
                    file: filename, line: i + 1, check: 'T0080',
                    severity: 'info',
                    confidence: 'low',
                    message: `函数 "${name}" 需要 ${expected} 个参数，但调用处传了 ${actual} 个`,
                    suggestion: actual > expected
                        ? `删除多余的参数`
                        : `补充缺失的参数`
                });
            }
        }
    }
}

function checkSizedLiteralZero(filename, lines, issues) {
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//')) continue;
        const m = trimmed.match(/\b0\s*'\s*[bdh]\s*\w+\b/);
        if (m) {
            issues.push({
                file: filename, line: i + 1, check: 'T0132',
                severity: 'warning',
                confidence: 'high',
                message: `零位宽字面量 "${m[0].trim()}" — Bit#(0) 尺寸为 0，不能容纳任何值`,
                suggestion: `使用非零位宽，或直接使用 ? 作为 don't-care`
            });
        }
    }
}

function checkG0053(filename, lines, issues) {
    // 检测 mkReg(模块参数) — G0053 风险
    // 模式: mkReg(cpol) 或 mkReg(divider) 等非字面量参数
    // 注意: mkReg(?)、mkReg(0)、mkReg(1)、mkReg(maxBound) 是合法的
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 匹配: <- mkReg(X) 其中 X 不是 0, 1, ?, maxBound, unpack(...)
        const m = line.match(/<-\s*mkReg\(\s*([^)]+)\s*\)/);
        if (!m) continue;
        const init = m[1].trim();
        // 允许的字面量
        if (init === '?' || init === '0' || init === '1' ||
            init.match(/^\d+$/) || init === 'maxBound' ||
            init.startsWith('unpack(') || init.startsWith('fromInteger(') ||
            init.startsWith('truncate(') || init.startsWith('extend(') ||
            init === 'False' || init === 'True') continue;
        // Uppercase-first identifiers are enum constructors (e.g. IDLE, ACTIVE) —
        // compile-time constants that are valid mkReg initializers
        if (/^[A-Z][a-zA-Z0-9_]*$/.test(init)) continue;
        // 包含标识符 → 可能是模块参数或变量 → 警告
        if (/[a-zA-Z_]/.test(init)) {
            issues.push({
                file: filename,
                line: i + 1,
                check: 'G0053',
                severity: 'warning',
                confidence: 'high',
                message: `mkReg 初始化值 "${init}" 可能是模块参数或变量——非编译期静态常量，编译时可能触发 G0053`,
                suggestion: '改用 mkRegU（不初始化），然后在 rule/method 中显式赋初值。或确认该值确实是编译期常量。'
            });
        }
    }
}

/**
 * checkInterfaceBoolReturn — detect interface methods returning Bool instead of Bit#(1).
 * Interface methods defining hardware signals should use Bit#(1), not Bool.
 * Bool is a software type that cannot participate in bit concatenation and
 * complicates downstream module connections.
 * Always-on rule (added 2026-07-14 per council resolution).
 */
function checkInterfaceBoolReturn(filename, content, issues) {
    // Find interface blocks and check method return types
    const ifBlocks = content.match(/interface\s+\w+[\s\S]*?endinterface/g) || [];
    for (const block of ifBlocks) {
        // Match method declarations: method Type name(args) or method Action name(args)
        // Look for Bool as return type
        const methodMatches = block.matchAll(/method\s+(Bool)\s+(\w+)\s*[\(;]/g);
        for (const m of methodMatches) {
            const methodName = m[2];
            const methodLineEst = content.substring(0, content.indexOf(m[0])).split('\n').length + 1;
            issues.push({
                file: filename,
                line: methodLineEst,
                check: 'interface-bool-return',
                severity: 'warning',
                confidence: 'high',
                message: `接口方法 "${methodName}" 返回 Bool 类型 — 硬件接口应返回 Bit#(1)`,
                suggestion: `将 method Bool ${methodName} 改为 method Bit#(1) ${methodName}。Bool 不能参与位拼接，会导致下游模块连接困难。`
            });
        }
        // Also check method Action with Bool parameters
        const actionMatches = block.matchAll(/method\s+Action\s+\w+\s*\(([^)]*Bool[^)]*)\)/g);
        for (const m of actionMatches) {
            const params = m[1];
            const paramMatches = params.matchAll(/\bBool\s+(\w+)/g);
            for (const pm of paramMatches) {
                const paramName = pm[1];
                const methodLineEst = content.substring(0, content.indexOf(m[0])).split('\n').length + 1;
                issues.push({
                    file: filename,
                    line: methodLineEst,
                    check: 'interface-bool-param',
                    severity: 'info',
                    confidence: 'high',
                    message: `接口方法参数 "${paramName}" 使用 Bool 类型 — 硬件接口参数应使用 Bit#(1)`,
                    suggestion: `将 Bool ${paramName} 改为 Bit#(1) ${paramName}`
                });
            }
        }
    }
}

/**
 * checkAlwaysAttrMisuse — detect always_ready/enabled on methods with guard conditions
 * or conditional bodies. Methods with guards should NOT be marked always_ready/enabled
 * because the attribute states the method is available every cycle, which contradicts
 * the guard condition.
 * Always-on rule (added 2026-07-14 per council resolution).
 */
function checkAlwaysAttrMisuse(filename, content, issues) {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//')) continue;

        // Match attribute: (* always_ready, always_enabled *) or (* always_ready *)
        const attrMatch = trimmed.match(/\(\*\s*(.+?)\s*\*\)/);
        if (!attrMatch) continue;
        const attrs = attrMatch[1].toLowerCase();
        const hasAlwaysReady = /\balways_ready\b/.test(attrs) || /\balwaysready\b/.test(attrs);
        const hasAlwaysEnabled = /\balways_enabled\b/.test(attrs) || /\balwaysenabled\b/.test(attrs);
        if (!hasAlwaysReady && !hasAlwaysEnabled) continue;

        // Look forward for the method declaration. Accumulate lines until
        // semicolon (end of method signature) to handle multi-line declarations.
        let methodLines = [];
        let foundMethod = false;
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
            const nextLine = lines[j].trim();
            if (nextLine.startsWith('//')) continue;

            // Check for method keyword to start accumulation
            if (!foundMethod && /^\s*method\s+/.test(nextLine)) {
                foundMethod = true;
                methodLines.push(nextLine);
                // If this single line already ends with ;, check immediately
                if (/;\s*$/.test(nextLine)) break;
                continue;
            }

            if (foundMethod) {
                methodLines.push(nextLine);
                // Stop accumulating at semicolon or encountering another keyword
                if (/;\s*$/.test(nextLine) || /\(\*\s*.*\s*\*\)/.test(nextLine) ||
                    /^\s*(module|interface|rule|endinterface|method)\b/.test(nextLine)) {
                    break;
                }
                continue;
            }

            // If we hit another attribute, module, interface, or rule before finding method, stop
            if (/\(\*\s*.*\s*\*\)/.test(nextLine) || /^\s*(module|interface|rule|endinterface)\b/.test(nextLine)) {
                break;
            }
        }

        if (foundMethod && methodLines.length > 0) {
            const fullDecl = methodLines.join(' ');
            const hasGuard = /\bif\s*\(/.test(fullDecl);
            if (hasGuard) {
                const methodNameMatch = fullDecl.match(/method\s+(?:Action\s+)?(?:\S+\s+)?(\w+)/);
                const methodName = methodNameMatch ? methodNameMatch[1] : 'unknown';
                issues.push({
                    file: filename,
                    line: i + 1,
                    check: 'always-attr-guard-conflict',
                    severity: 'warning',
                    confidence: 'high',
                    message: `方法 "${methodName}" 有 guard 条件但标记了 always_ready/enabled — 属性与实际语义矛盾`,
                    suggestion: '移除 always_ready/enabled 属性，或移除 guard 条件。有 guard 的 method 不是每周期可用，不应标 always。'
                });
            }
        }
    }
}

/**
 * checkP0022AttrOnMethod — detect (* always_enabled/ready *) pragma on module
 * method implementations. BSC requires suffix keyword instead:
 *   method Action foo() always_enabled;
 * The pragma form (* always_enabled *) is only valid on:
 *   - Interface method declarations
 *   - BVI import methods
 * Not on module method implementations (triggers P0022).
 * Always-on rule (added 2026-07-15).
 */
function checkP0022AttrOnMethod(filename, lines, issues) {
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('//')) continue;

        // Match attribute pragma with always_enabled or always_ready
        const attr = line.match(/\(\*\s*(.+?)\s*\*\)/);
        if (!attr) continue;
        const attrs = attr[1].toLowerCase();
        if (!/\balways_enabled\b/.test(attrs) && !/\balways_ready\b/.test(attrs)) continue;

        // Look for method keyword on this line or next 2 lines
        for (let j = i; j < Math.min(i + 3, lines.length); j++) {
            const next = lines[j].trim();
            if (next.startsWith('//')) continue;

            const methodMatch = next.match(/^\s*method\s+(?:\w+(?:#\([^)]*\))?\s+)?(\w+)/);
            if (!methodMatch) {
                // Stop if we hit another attribute or structural keyword
                if (/\(\*\s*.*\s*\*\)/.test(next) && j > i) break;
                if (/^\s*(?:module|interface|rule|endmodule|endinterface)\b/.test(next)) break;
                continue;
            }

            const methodName = methodMatch[1];

            // Distinguish module implementation (has endmethod) from
            // interface declaration (ends with ;)
            let hasEndmethod = false;
            for (let k = j + 1; k < Math.min(j + 40, lines.length); k++) {
                const bodyLine = lines[k].trim();
                if (/^\s*endmethod\b/.test(bodyLine)) {
                    hasEndmethod = true;
                    break;
                }
                // Stop at structural boundaries — method is in an interface
                // declaration (no endmethod within this scope)
                if (/^\s*(?:endinterface|interface)\b/.test(bodyLine)) {
                    break;
                }
                // Stop at module/endmodule — reached a different scope
                if (/^\s*(?:module|endmodule)\b/.test(bodyLine)) {
                    break;
                }
            }

            if (hasEndmethod) {
                issues.push({
                    file: filename,
                    line: i + 1,
                    check: 'P0022',
                    severity: 'warning',
                    confidence: 'high',
                    message: `方法 "${methodName}" 在 module 实现上使用了 (* always_enabled/always_ready *) pragma — module 内 method 不能用 pragma 形式`,
                    suggestion: `删除 (* always_enabled *) pragma，改为 method Action ${methodName}(...) always_enabled;（suffix 关键字形式）`
                });
            }
            break;
        }
    }
}

/**
 * checkBVIScheduleGroupSyntax — detect BVI schedule group syntax.
 * BSC does NOT support `schedule A CF (B, C, D)` grouping — must be
 * expanded to pair-wise `schedule A CF B; schedule A CF C; schedule A CF D;`.
 * Full-scan rule (added 2026-07-15).
 */
function checkBVIScheduleGroupSyntax(filename, content, issues) {
    // Find BVI import blocks: import "BVI" ... endmodule
    const bviBlockRe = /import\s+"BVI"[\s\S]*?endmodule/g;
    let blockMatch;
    while ((blockMatch = bviBlockRe.exec(content)) !== null) {
        const block = blockMatch[0];
        const blockStartIdx = blockMatch.index;

        // Find schedule declarations with parenthesized method list (group syntax)
        // Pattern: schedule methodName CF (methodA, methodB, ...)
        const schedRe = /schedule\s+(\w+)\s+(CF|SB|SBR|C)\s*\(([^)]+)\)/g;
        let schedMatch;
        while ((schedMatch = schedRe.exec(block)) !== null) {
            const methods = schedMatch[3].split(',').map(s => s.trim()).filter(Boolean);
            if (methods.length >= 2) {
                const lineEst = content.substring(0, blockStartIdx + schedMatch.index).split('\n').length;
                issues.push({
                    file: filename,
                    line: lineEst,
                    check: 'P0200',
                    severity: 'warning',
                    confidence: 'medium',
                    message: `BVI schedule 使用了分组语法 schedule ${schedMatch[1]} ${schedMatch[2]} (${methods.join(', ')}) — BSC 不支持分组，必须逐对声明`,
                    suggestion: `展开为逐对声明：${methods.map(m => `schedule ${schedMatch[1]} ${schedMatch[2]} ${m}`).join('; ')}`
                });
            }
        }
    }
}

/**
 * checkSynthesizeAnnotationOrder — detect urgency/execution_order annotations
 * placed AFTER (* synthesize *) in module body.
 * (* synthesize *) creates a scheduling annotation boundary — annotations
 * inside the module body after synthesize may not reach bsc's code generation
 * phase (where G0010 is produced). Method-vs-rule conflicts are especially affected.
 * Full-scan rule (added 2026-07-15).
 */
function checkSynthesizeAnnotationOrder(filename, content, issues) {
    const lines = content.split('\n');
    let inSynthModule = false;
    let modName = '';

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//')) continue;

        // Check for (* synthesize *) module entry
        const modMatch = trimmed.match(/^module\s+(\w+)/);
        if (modMatch) {
            modName = modMatch[1];
            // Check if previous line had (* synthesize *)
            const prevLine = i > 0 ? lines[i - 1].trim() : '';
            inSynthModule = /\(\*\s*synthesize\s*\*\)/.test(prevLine) || /\(\*\s*synthesize\s*\*\)/.test(trimmed);
            continue;
        }
        if (/^endmodule/.test(trimmed)) {
            inSynthModule = false;
            continue;
        }

        if (!inSynthModule) continue;

        // Detect urgency/execution_order annotations inside synthesize module body
        if (/(?:descending_urgency|execution_order|preempts)\s*=\s*"/.test(trimmed)) {
            issues.push({
                file: filename,
                line: i + 1,
                check: 'G0010',
                severity: 'warning',
                confidence: 'medium',
                message: `模块 "${modName}" 的调度注解在 (* synthesize *) 模块体内 — synthesize 创建调度边界，跨 method/rule 冲突的 G0010 可能不会消除`,
                suggestion: `将 (* descending_urgency = "..." *) 移到 (* synthesize *) 之前作为模块级属性，使注解传递给代码生成阶段`
            });
        }
    }
}
