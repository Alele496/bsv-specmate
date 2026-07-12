import { queryAllErrors } from '../db/query.mjs';
import { getLevel, LEVEL_LIMITS } from '../config.mjs';
import { parseFile } from './ast_query.mjs';

// ---------------------------------------------------------------------------
// AST helpers (local — ast_query.mjs does not export walk/findAncestor)
// ---------------------------------------------------------------------------

function walk(node, visitor) {
    if (visitor(node)) return true;
    for (const child of node.namedChildren) {
        if (walk(child, visitor)) return true;
    }
    return false;
}

function findAncestor(node, types) {
    const set = new Set(types);
    let cur = node.parent;
    while (cur) {
        if (set.has(cur.type)) return cur;
        cur = cur.parent;
    }
    return null;
}

function textOf(node, source) {
    return source.substring(node.startIndex, node.endIndex);
}

function firstChildOfType(node, types, source) {
    const set = new Set(Array.isArray(types) ? types : [types]);
    for (const child of node.namedChildren) {
        if (set.has(child.type)) return child;
    }
    return null;
}

const COMMON_WARNINGS = [
    {
        title: '跨 Rule 数据传递',
        detail: '跨 rule 传递触发 + 数据，用 FIFOF 而非 PulseWire + Reg 组合。PulseWire 只存活一个 cycle，搭配 Reg 会导致首个数据丢失。',
        ref: 'G0010',
    },
    {
        title: '跨模块调度标注',
        detail: '外部模块 method 写入寄存器，内部 rule 读取同寄存器 → 需显式加 `(* descending_urgency = "ext_method, int_rule" *)`。',
        ref: 'G0010',
    },
    {
        title: 'Verilog 端口命名',
        detail: 'BSV `method Action` 的端口名 = 参数名（非方法名）。Vivado 连接时需用 `top_wrapper.v` 薄封装对齐端口。',
        ref: 'BSV-PORTS',
    },
    {
        title: 'Interface 导出歧义',
        detail: '多接口模块的 method 导出需避免同名冲突。同名 method 需用 `(* prefix = "" *)` 或拆分子模块。',
        ref: 'P0032',
    },
    {
        title: 'always_ready 判断',
        detail: '无 guard 的 method 会自动推断为 always_ready。若需延迟响应，显式加 guard 条件而非依赖默认行为。',
        ref: null,
    },
    {
        title: 'Clock domain crossing',
        detail: 'BSV 中跨时钟域数据需使用 `mkSyncFIFO` 或 `mkSyncBit05`，直接用普通寄存器会在综合时产生不确定行为。',
        ref: null,
    },
    {
        title: 'Bool 与 Bit 类型切勿混淆',
        detail: '`Bool` 和 `Bit#(1)` 是不同的类型。接口方法（method）返回值用 `Bit#(1)` 不用 `Bool`——`Bool` 是软件类型，硬件接口统一用 `Bit#(1)`。控制信号如需位拼接或从 Bus 中提取，优先用 `Reg#(Bit#(1))` 而非 `Reg#(Bool)`。Bool 不能用于 `{...}` 拼接，也不能直接用 `bit[0]` 赋值。',
        ref: 'T0061',
    },
    {
        title: 'Vector 构造用 genWith',
        detail: 'BSC 2025.07 标准库不导出 `vec()` 函数。构造 Vector 用 `genWith(fromInteger)` 或显式 `genWith(fn)`。',
        ref: 'T0004',
    },
];

// ---------------------------------------------------------------------------
// AST scanners — each scans a parsed BSV file for a specific error pattern
// ---------------------------------------------------------------------------

function scanP0030(tree, source, issues) {
    // Find return statements inside for/if/while/case that are inside functions.
    // A return in a value method's for-loop body triggers P0030 — bsc rejects
    // non-tail returns in value methods.
    const BLOCK_TYPES = new Set(['for_stmt', 'if', 'while_stmt', 'case']);
    walk(tree.rootNode, (node) => {
        if (node.type === 'return') {
            const func = findAncestor(node, ['function']);
            if (!func) return false;
            // Walk up from return to function, check for forbidden block ancestors
            let cur = node.parent;
            while (cur && cur !== func) {
                if (BLOCK_TYPES.has(cur.type)) {
                    issues.push({
                        code: 'P0030',
                        title: 'function 内的 for/if 块中不可用 return',
                        detail: `function 内的 return 只能在函数末尾。行 ${node.startPosition.row + 1} 的 return 在 ${cur.type} 块内，需用 flag 变量 + 末尾 return 替代。`,
                        line: node.startPosition.row + 1,
                    });
                    return true;
                }
                cur = cur.parent;
            }
        }
        return false;
    });
}

function scanT0043(tree, source, issues) {
    // Find moduleDef nodes whose parameter section contains Integer, String,
    // or numeric type — these are not synthesizable.
    const mods = [];
    walk(tree.rootNode, (node) => {
        if (node.type === 'moduleDef') mods.push(node);
        return false;
    });
    for (const mod of mods) {
        const modText = textOf(mod, source);
        const paramMatch = modText.match(/#\s*\([^)]*\)/);
        if (!paramMatch) continue;
        const params = paramMatch[0];
        if (/\bInteger\b/.test(params) || /\bnumeric\s+type\b/.test(params) || /\bString\b/.test(params)) {
            const name = firstChildOfType(mod, ['variable', 'lcIdentifier']);
            const modName = name ? textOf(name, source) : 'unknown';
            issues.push({
                code: 'T0043',
                title: '模块包含无法综合的类型参数',
                detail: `模块 "${modName}" 的参数包含 Integer/String/numeric type，(* synthesize *) 模块的所有参数必须是 Bits 类的具体类型（如 Bit#(n)、UInt#(n)）。`,
                line: mod.startPosition.row + 1,
            });
        }
    }
}

function scanG0053(tree, source, issues) {
    // Find mkReg(variable) where arg is not a compile-time literal.
    // Module parameters (even Bit#(n)) are not static constants in BSV.
    const REG_INIT_MODULES = ['mkReg', 'mkRegA'];
    walk(tree.rootNode, (node) => {
        if (node.type !== 'moduleinst') return false;
        const rhs = firstChildOfType(node, ['moduleinstRHS']);
        if (!rhs) return false;
        const rhsText = textOf(rhs, source);
        for (const regMod of REG_INIT_MODULES) {
            const escaped = regMod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const argMatch = rhsText.match(new RegExp(escaped + '\\s*\\(\\s*([^)]+)\\s*\\)'));
            if (!argMatch) continue;
            const arg = argMatch[1].trim();
            // Literal check: numeric, hex, binary, char, ?, maxBound, tagged, unpack, fromInteger
            const isLiteral = /^(0|[1-9]\d*|0x[0-9a-fA-F]+|0b[01]+|'.*'|"|True|False|\?|maxBound|minBound|unpack\s*\(|fromInteger\s*\(|tagged\s)/.test(arg);
            if (isLiteral) continue;
            const name = firstChildOfType(node, ['lcIdentifier', 'variable']);
            const regName = name ? textOf(name, source) : 'unknown';
            issues.push({
                code: 'G0053',
                title: '子模块初始化用了动态表达式',
                detail: `寄存器 "${regName}" 的初始化参数 "${arg}" 不是编译期静态常量。模块参数不被视为静态常量——改用 mkRegU + 后续显式赋值。`,
                line: node.startPosition.row + 1,
            });
            return true;
        }
        return false;
    });
}

function scanG0005(tree, source, issues) {
    // Check for no_implicit_conditions attribute. If present, confirm. If absent
    // and the module has if/case without else/default, flag it as a recommendation.
    const hasAttr = source.includes('no_implicit_conditions');
    if (!hasAttr) {
        // Only flag if there are if/case constructs that might need it
        let hasConditional = false;
        walk(tree.rootNode, (node) => {
            if (node.type === 'if' || node.type === 'case') { hasConditional = true; return true; }
            return false;
        });
        if (hasConditional) {
            issues.push({
                code: 'G0005',
                title: '缺少 no_implicit_conditions 属性',
                detail: '代码中有 if/case 语句但未找到 `(* no_implicit_conditions *)` 属性。建议在模块定义前添加该属性以确保完备性检查。',
                line: 0,
            });
        }
    }
}

/**
 * Run all AST scans on a file. Returns issues array.
 */
function scanAST(parsed) {
    const { tree, source } = parsed;
    const issues = [];
    scanP0030(tree, source, issues);
    scanT0043(tree, source, issues);
    scanG0053(tree, source, issues);
    scanG0005(tree, source, issues);
    return issues;
}

// ---------------------------------------------------------------------------
// preflight — main entry
// ---------------------------------------------------------------------------

export async function preflight(filePath = null) {
    const level = getLevel();
    const cfg = LEVEL_LIMITS[level];
    const limit = cfg.errors;
    const highlight = cfg.highlight;

    const allErrors = await queryAllErrors();
    const topErrors = allErrors.slice(0, limit);

    // AST scan: run if a file path was provided
    let astIssues = [];
    if (filePath) {
        const parsed = parseFile(filePath);
        if (parsed) {
            astIssues = scanAST(parsed);
        }
    }

    const lines = [];

    lines.push(`## 🔴 高频编译错误 (${highlight})`);
    lines.push('');
    lines.push(`当前模式: **${cfg.name}** — 设置 \`SPECMATE_LEVEL=verify|develop|tapeout\` 切换干涉强度`);
    lines.push('');

    // AST scan results: show before DB top errors if any issues found
    if (astIssues.length > 0) {
        lines.push('### 🔍 代码静态扫描');
        lines.push('');
        for (const issue of astIssues) {
            if (issue.line > 0) {
                lines.push(`- **${issue.code}** (行${issue.line}): ${issue.detail}`);
            } else {
                lines.push(`- **${issue.code}**: ${issue.detail}`);
            }
        }
        lines.push('');
    }

    for (const e of topErrors) {
        lines.push(`### ${e.code} — ${e.title} (×${e.count})`);
        lines.push(`→ ${summarizeRule(e.code)}`);
        lines.push('');
    }

    if (LEVEL_LIMITS[level].mode !== 'passive') {
        lines.push('---');
        lines.push('');
        lines.push('## ⚠️ 常见设计警告');
        lines.push('');
        const warnCount = LEVEL_LIMITS[level].mode === 'suggestive' ? 3 : COMMON_WARNINGS.length;
        for (const w of COMMON_WARNINGS.slice(0, warnCount)) {
            lines.push(`### ${w.title}`);
            lines.push(w.detail);
            if (w.ref) lines.push(`→ 详见: lookup_error("${w.ref}")`);
            lines.push('');
        }
    }

    if (cfg.collabHint) {
        lines.push('---');
        lines.push('');
        lines.push('## 🤝 编码前检查');
        lines.push('');
        lines.push('作为你的编码搭档，我建议开始前做几件事：');
        lines.push('· `lookup_ref(topic="styles")` 根据项目类型选择合适的代码风格');
        lines.push('· 涉及多模块集成时 → `lookup_ref(topic="schedule")` 了解 G0004 修复模式');
        lines.push('· 涉及 FSM 时 → 控制信号用 `Bit#(1)`，枚举类型 case 省略 default');
        lines.push('· 复杂接口对齐时 → `lookup_example(keyword)` 搜官方用例参考');
        lines.push('');
        lines.push('编码过程中遇到任何 BSV 语法不确定性，随时来问。');
    }

    return lines.join('\n');
}

function summarizeRule(code) {
    const rules = {
        'P0032': '所有 module/rule 必须在所有 method 之前。',
        'P0005': '标识符不用 action/bit/byte/reg/wire/module/input/output/priority 等 SV 保留字。',
        'G0004': '同一 rule 内每个寄存器只能被写入一次，检查 case default 分支。',
        'G0005': '加 `(* no_implicit_conditions *)` 属性确保 if/case 完备性检查。调用 lookup_error("G0005") 获取详情。',
        'G0010': '跨 rule 数据用 FIFOF 传，跨模块互斥加 urgency 标注。',
        'G0053': '寄存器初始化只能用字面量（0, 1, ?, maxBound），模块参数不在此列——改用 mkRegU。调用 lookup_error("G0053") 获取详情。',
        'T0043': '(* synthesize *) 模块的参数必须是 Bits 类具体类型（Bit#(n)/UInt#(n)），不能用 Integer。调用 lookup_error("T0043") 获取详情和修复示例。',
        'T0060': '`{...}` 拼接总位宽 = 目标寄存器位宽，逐一核对。',
        'T0061': 'Bool 用 `!`/`&&`/`||`，Bit#(n) 用 `~`/`&`/`|`。控制信号需位拼接时用 `Bit#(1)` 不用 `Bool`。',
        'T0051': '扩大寄存器位宽时，所有相关寄存器同步扩宽。',
        'BSV-PORTS': 'method Action 的 Verilog 端口名 = 参数名，非方法名。',
        'T0004': 'Vector 构造用 `genWith` 而非 `vec()`。',
        'P0030': 'Value method 用 `= expr` 或 `? :` 三元链，不能用 if-return。function 内 for 循环也不可直接 return——用 flag + 末尾 return。',
        'T0011': '寄存器名不要和方法名重名，寄存器加后缀 _reg 或 _r。',
    };
    return rules[code] || '见 lookup_error 详情。';
}
