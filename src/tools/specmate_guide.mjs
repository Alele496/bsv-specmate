import { extractKeywords, match, filterTrapsByMode, filterTrapsByPhase, formatTrapsOutput, inferPhase, UNIVERSAL_TRAPS } from './_matcher.mjs';
import { searchPatterns } from './_patterns.mjs';
import { queryError, queryAllErrors, queryTopRules, queryHotTopics, hitError, addCapture, queryRecentCaptures } from '../db/query.mjs';
import { lookupRef } from './lookup_ref.mjs';
import { getLevel, LEVEL_LIMITS } from '../config.mjs';
import { parseFile, queryNodeAt } from './ast_query.mjs';
import { preflight, scanAST } from './preflight.mjs';

export async function guide({ phase, input, file }) {
    const level = getLevel();
    const cfg = LEVEL_LIMITS[level];

    switch (phase) {
        case 'pre_code': return preCode(input, level, cfg, file);
        case 'on_error': return onError(input, level, cfg);
        case 'continue': return continue_(input, level, cfg);
        case 'decide': return decide(input, level, cfg);
        case 'pattern': return patternPhase(input, level, cfg);
        default: return `Unknown phase "${phase}". Use: pre_code, on_error, continue, decide, pattern.`;
    }
}

async function preCode(input, level, cfg, file = null) {
    const lines = [];

    // ── Pillar 1a: run AST preflight if a file path is provided ──
    let preflightResult = null;
    if (file && cfg.mode !== 'passive') {
        try {
            preflightResult = await preflight(file);
        } catch (_) { /* preflight is non-critical */ }
    }

    // ── UNIVERSAL_TRAPS: core safety rules that always apply ──
    const groupedByMode = filterTrapsByMode(UNIVERSAL_TRAPS, cfg.mode);
    const universalTraps = groupedByMode.hard;
    if (universalTraps.length > 0) {
        lines.push('## ⚠ 编译硬约束（必须遵守）');
        lines.push('');
        for (let i = 0; i < universalTraps.length; i++) {
            lines.push(`  ${i + 1}. ${universalTraps[i].text}`);
        }
        lines.push('');
    }

    // ── Message: specmate does not do active guidance ──
    lines.push('---');
    lines.push('');
    lines.push('> **specmate 当前不做主动设计指导。**');
    lines.push('> 请用最保守的 BSV 写法自主完成架构：Bit#(1) 不用 Bool、显式 guard 不用 always_ready、');
    lines.push('> 子接口组织、手写 state register 不用 StmtFSM、跨 rule 数据用 FIFOF 传递。');
    lines.push('> **编码完成后运行 `npx specmate check --full` 验证代码正确性。**');
    lines.push('');

    // ── Preflight AST scan results ──
    if (file && preflightResult && cfg.mode !== 'passive') {
        const astSectionMatch = preflightResult.match(/### 🔍 代码静态扫描\n\n([\s\S]*?)(?=\n## |\n---|\n$)/);
        if (astSectionMatch) {
            const astLines = astSectionMatch[1].trim();
            if (astLines && !astLines.includes('未发现')) {
                lines.push('---');
                lines.push('### 🔍 预编译扫描结果 (specmate preflight)');
                lines.push('');
                lines.push(astLines);
                lines.push('');
                lines.push('> 这些是 specmate 用 AST 直接扫描你的 .bsv 文件发现的——**不需要跑 bsc**。');
                lines.push('> 修完这些问题再编译，首编通过率大幅提升。');
                lines.push('');
            }
        }
    }

    // ── Error memory (from database) — still shown as passive context ──
    if (cfg.mode !== 'passive') {
        try {
            const recentCaps = await queryRecentCaptures(5);
            if (recentCaps.length > 0) {
                const relevant = recentCaps.filter(c => c.status !== 'resolved');
                if (relevant.length > 0) {
                    lines.push('---');
                    lines.push('### 📝 未解决的编译错误');
                    for (const c of relevant) {
                        const preview = (c.bsc_output || '').replace(/\n/g, ' ').substring(0, 80);
                        lines.push(`  ⏳ ${c.code} — ${preview}`);
                    }
                    lines.push('');
                }
            }
        } catch (_) { /* non-critical */ }
    }

    if (lines.length === 0) {
        return 'specmate 当前不做主动指导。请用最保守的 BSV 写法自主完成架构，编码完成后运行 `npx specmate check --full` 验证。';
    }
    return lines.join('\n');
}

async function onError(input, level, cfg) {
    const codeMatch = input.match(/\b([GPTBS]\d{4})\b/g);
    let code = codeMatch ? codeMatch[codeMatch.length - 1] : '';

    if (!code) {
        const keywords = input.toLowerCase();
        const all = await queryAllErrors();
        const relevant = all.filter(e =>
            e.title?.toLowerCase().includes(keywords) ||
            e.keywords?.toLowerCase().includes(keywords)
        );
        if (relevant.length > 0) {
            return '相关错误:\n' +
                relevant.slice(0, 5).map(e => `  ${e.code}: ${e.title} (×${e.count})`).join('\n') +
                '\n\n用 specmate_guide(phase="on_error", input="错误码") 查看详情。';
        }
        return `在错误描述中没找到错误码。判断一下 bsc 输出的错误码（如 G0004），再调 specmate_guide(phase="on_error", input="错误码")。`;
    }

    const err = await queryError(code);

    // Hit count: every time someone looks up this error, increment (fire-and-forget)
    if (err) hitError(code).catch(err => console.error('[specmate] hitError in onError failed:', err.message));

    // Auto-capture: log every on_error query for project memory (fire-and-forget)
    addCapture({ code, bsc_output: input, files: null }).catch(err => console.error('[specmate] addCapture in onError failed:', err.message));

    if (!err) {
        if (LEVEL_LIMITS[level].mode === 'passive') {
            return `错误码 "${code}" 未收录。提升 SPECMATE_LEVEL 查看相似条目。`;
        }
        const all = await queryAllErrors();
        const candidates = all.filter(e =>
            e.keywords?.toLowerCase().includes(code.toLowerCase()) ||
            e.title?.toLowerCase().includes(code.toLowerCase())
        ).slice(0, 3);
        if (candidates.length > 0) {
            return `错误码 "${code}" 未找到。相近条目:\n` +
                candidates.map(c => `  ${c.code}: ${c.title}`).join('\n') +
                '\n\n如果确实是新错误: specmate_learn(...)';
        }
        return `错误码 "${code}" 未找到。如果是新错误，用 specmate_learn 加入编码记忆。`;
    }

    if (LEVEL_LIMITS[level].mode === 'passive') {
        return [
            `## ${err.code} — ${err.title} (×${err.count})`,
            '',
            '> ' + (err.rules || err.cause?.substring(0, 200) || ''),
            '',
            '提升 SPECMATE_LEVEL=develop 或 tapeout 查看完整方案。',
        ].join('\n');
    }

    const base = [
        `## ${err.code} — ${err.title} (×${err.count})`,
        '',
        '### 现象 (bsc 输出)',
        err.phenomena || '(未记录)',
        '',
        '### 原因',
        err.cause || '(未记录)',
        '',
        '### 解决方案',
        err.solution || '(未记录)',
        err.rules ? `\n> **规则**: ${err.rules}` : '',
    ];

    const refMap = {
        P0005: 'keywords', P0030: 'module', P0032: 'module',
        T0060: 'types', T0061: 'types', T0051: 'types',
        G0004: 'schedule', G0010: 'schedule',
        T0004: 'stdlib', T0011: 'keywords',
        T0016: 'structs', T0080: 'module',
        P0073: 'module', P0085: 'attributes',
        G0030: 'schedule', G0040: 'schedule', G0054: 'attributes',
        T0132: 'types', T0144: 'unions',
    };
    const topic = refMap[code];
    if (topic) {
        base.push(`\n📖 相关: \`lookup_ref(topic="${topic}")\``);
    }

    if (cfg.scanSimilar) {
        base.push('');
        base.push('🔍 你的代码中可能存在类似模式。');
        base.push('建议对相关文件执行 specmate_check，或用 specmate_guide(phase="continue") 找到下一步。');
    }

    if (cfg.collabHint) {
        base.push('');
        base.push('💬 修完后如果需要继续写其他部分，调 specmate_guide(phase="continue", input="简要描述下一步")。');
    }

    // AST context: if the error input mentions a file + line, show AST context
    const astCtx = getASTContext(input);
    if (astCtx) {
        base.push('');
        base.push('### 🔬 AST 上下文');
        base.push(`\`${astCtx.file}:${astCtx.line}\` — 错误位置所在节点: **${astCtx.nodeType}**`);
        base.push('```bsv');
        base.push(astCtx.nodeText);
        base.push('```');
        if (astCtx.ancestors.length > 0) {
            base.push(`外围结构: ${astCtx.ancestors.map(a => `\`${a.type}\``).join(' → ')}`);
        }
    }

    return base.join('\n');
}

/**
 * Extract file:line info from bsc error output and return AST context.
 * BSC error format: "File.bsv", line 454, column 26: (T0011)
 * Also handles Windows paths like D:\project\File.bsv
 */
function getASTContext(input) {
    const m = input.match(/(["']?)([^\s,"']+\.bsv)\1[,\s]+line\s+(\d+)(?:[,\s]+column\s+(\d+))?/i);
    if (!m) return null;

    const filePath = m[2];
    const line = parseInt(m[3], 10);
    const col = m[4] ? parseInt(m[4], 10) : 1;

    const parsed = parseFile(filePath);
    if (!parsed) return null;

    const node = queryNodeAt(parsed.tree, parsed.source, line, col);
    if (!node) return null;

    return {
        file: filePath,
        line,
        nodeType: node.type,
        nodeText: node.text.length > 300 ? node.text.substring(0, 300) + '\n...' : node.text,
        ancestors: (node.ancestors || []).slice(0, 5),
    };
}

async function continue_(input, level, cfg) {
    const keywords = extractKeywords(input);
    const m = match(keywords);

    const lines = [];

    if (m.traps.length > 0) {
        const grouped = filterTrapsByMode(m.traps, cfg.mode);
        const allVisible = [...grouped.hard, ...grouped.quality, ...grouped.style];
        if (allVisible.length > 0) {
            lines.push('🔮 接下来可能遇到:');
            const count = cfg.mode === 'passive' ? Math.min(1, allVisible.length) : cfg.mode === 'suggestive' ? Math.min(3, allVisible.length) : allVisible.length;
            for (let i = 0; i < count; i++) {
                lines.push(`  • ${allVisible[i].text}`);
            }
            lines.push('');
        }
    }

    if (m.errors.length > 0 && LEVEL_LIMITS[level].mode !== 'passive') {
        lines.push(`⚠ 相关错误码: ${m.errors.join(', ')}`);
        lines.push(`  编译后如果遇到，直接 specmate_guide(phase="on_error", input="错误码")`);
        lines.push('');
    }

    if (m.refs.length > 0 && LEVEL_LIMITS[level].mode !== 'passive') {
        lines.push(`📖 建议先看: ${m.refs.map(r => `lookup_ref(topic="${r}")`).join(', ')}`);
        lines.push('');
    }

    if (cfg.collabHint) {
        const hot = await queryHotTopics(3);
        if (hot.length > 0) {
            lines.push(`🔥 当前编码热点: ${hot.map(h => `${h.topic} (x${h.count})`).join(', ')}`);
        }
    }

    if (lines.length === 0) {
        return '没有匹配到下一步陷阱。写完后调 specmate_check 检查代码。';
    }
    return lines.join('\n');
}

// ── Pillar 1b: GRAPH-driven design decision engine ──
// Instead of 5 hardcoded if-else, we use a decision map that covers the most
// common BSV architectural choices. Each entry maps keywords → decision output.
// This is NOT a full inference engine — it's a lookup table backed by the
// knowledge graph nodes.
// Moved to module scope so both decide() and scan() can access it.

const DECISIONS = [
        {
            keywords: ['fifo', 'bypass'],
            title: 'mkFIFO vs mkBypassFIFO',
            body: [
                '| | mkFIFO | mkBypassFIFO |',
                '|------|--------|-------------|',
                '| 同周期 enq/deq | 不可 | 可 (Bypass) |',
                '| G0010 风险 | 低 (CF) | 高 (需 extra scheduling) |',
                '| 适用场景 | 无 bypass 需求 | 需要组合逻辑通路 |',
                '',
                '> **建议**: 除非明确需要 bypass，否则用 mkFIFO。',
                '> 如果用 BypassFIFO，检查 enq/deq 是否跨 rule — G0010 高频触发。',
            ],
        },
        {
            keywords: ['fifo', 'fifof', 'lfi', 'pipeline', 'bram', 'sized'],
            title: 'FIFO 变体选择',
            body: [
                '| 类型 | 容量 | 用途 |',
                '|------|------|------|',
                '| mkFIFO | 2 | 基本点对点 |',
                '| mkFIFOF | 2 | 有 notFull/notEmpty 信号 |',
                '| mkBypassFIFO | 2 | 组合 bypass 路径 |',
                '| mkLFIFO | N | 大容量 FIFO |',
                '| mkBRAMFIFO | N | BRAM 上实现的大容量 |',
                '| mkSizedFIFO | N | 带 deq/enq 计数的 |',
                '| mkPipelineFIFO | N | 流水线 FIFO |',
                '',
                '📖 lookup_ref(topic="stdlib") 查看每种 FIFO 的接口定义。',
            ],
        },
        {
            keywords: ['bram', 'core', 'bramcore'],
            title: 'BRAM vs BRAMCore',
            body: [
                '| | BRAM | BRAMCore |',
                '|------|-------|----------|',
                '| 读写端口 | 单端口 | 双端口 (可配置) |',
                '| 接口 | 简单 Put/Get | 原生 BRAM signal |',
                '| G0004 风险 | 中 | 低 (显式 port 控制) |',
                '',
                '> **建议**: 需要同时读写用 BRAMCore，简单 FIFO 缓冲用 BRAM。',
                '> BRAMCore 需要手动管理 enable 和地址。',
            ],
        },
        {
            keywords: ['reg', 'config'],
            title: 'Reg vs ConfigReg',
            body: [
                '| | Reg | ConfigReg |',
                '|------|-----|-----------|',
                '| 写入冲突检查 | G0004 显式报错 | ConfigReg 优先上次写入 |',
                '| 调度参与 | 是 | 否 (schedule CF) |',
                '',
                '> **建议**: 配置寄存器用 ConfigReg（避免调度告警），计算用 Reg。',
            ],
        },
        {
            keywords: ['wire', 'reg'],
            title: 'Wire vs Reg',
            body: [
                '| | Wire | Reg |',
                '|------|------|-----|',
                '| 值保持 | 每个 cycle 刷新 | 保持到下次写入 |',
                '| 时机 | 同 cycle 可读 | 下一 cycle 可见 |',
                '| 用途 | 组合逻辑连接 | 时序状态 |',
                '',
                '> **建议**: 默认用 Reg。Wire 用于组合逻辑传递，且需确保每个 cycle 都有值写入。',
            ],
        },
        {
            keywords: ['regfile', 'full'],
            title: 'mkRegFile vs mkRegFileFull',
            body: [
                '| | mkRegFile | mkRegFileFull |',
                '|------|-----------|---------------|',
                '| 读端口数 | 有限（最多 5） | 理论不限 |',
                '| 实现 | 分布式寄存器 | 可能是 BRAM |',
                '| 初始化 | 部分支持 | 支持 load 初始化文件 |',
                '',
                '> **建议**: 寄存器数量少（<256）用 mkRegFile，大规模存储用 mkRegFileFull。',
                '> 注意 G0002: RegFile 最多 5 读端口限制。',
            ],
        },
        {
            keywords: ['fsm', 'stmt', 'statemachine', 'state machine'],
            title: 'StmtFSM vs 手写 state register',
            body: [
                '| | StmtFSM | 手写 state register |',
                '|------|---------|-------------------|',
                '| 可读性 | 高（代码即状态图） | 低（需追踪 state 转换） |',
                '| 调度控制 | 隐式（需 par/seq） | 显式（完全控制） |',
                '| G0004 风险 | 中（隐式并行写） | 低（显式控制） |',
                '| 适用场景 | 简单协议、快速原型 | 复杂调度、高性能 |',
                '',
                '> **建议**: 简单协议用 StmtFSM（代码清晰），复杂调度用手写 state register。',
                '> StmtFSM 内避免同一 cycle 写同一 Reg — 即使在不同 branch 中。',
            ],
        },
        {
            keywords: ['clock', 'sync', 'cros', 'domain'],
            title: '跨时钟域方案',
            body: [
                '| | mkSyncFIFO | mkSyncBit05 | mkSyncBRAMFIFO |',
                '|------|------------|-------------|----------------|',
                '| 数据量 | 小数据流 | 单 bit 控制信号 | 大数据量 |',
                '| 深度 | 2 | N/A | N |',
                '| 用途 | 跨域数据传递 | 复位/使能同步 | 跨域 FIFO |',
                '',
                '> **建议**: 数据用 mkSyncFIFO，控制信号用 mkSyncBit05，大量数据用 mkSyncBRAMFIFO。',
                '> 直接用普通寄存器跨时钟域会在综合时产生不确定行为。',
            ],
        },
        {
            keywords: ['bool', 'bit'],
            title: 'Bool vs Bit#(1) 选型',
            body: [
                '| | Bool | Bit#(1) |',
                '|------|------|---------|',
                '| 操作符 | `!` `&&` `||` | `~` `&` `|` |',
                '| 位拼接 | 不可 | 可 `{...}` |',
                '| 接口方法 | 不推荐 | **推荐** |',
                '| 适用场景 | 纯逻辑判断 | 硬件接口/控制信号 |',
                '',
                '> **建议**: 接口 method 返回值用 Bit#(1)（统一硬件接口），内部 done/valid 等纯逻辑信号可用 Bool。',
                '> 控制信号如需位拼接或从 Bus 中提取，必须用 Bit#(1)。',
            ],
        },
        {
            keywords: ['pipeline', 'stage', '级', '流水'],
            title: '流水线级间数据传递方案',
            body: [
                '| | FIFO | Wire + Reg | mkPipelineFIFO |',
                '|------|------|-----------|----------------|',
                '| 反压 | 自动 | 需手写 handshake | 自动 |',
                '| 延迟 | 1 cycle | 0 cycle（组合）+ 1 cycle | 可配置 |',
                '| G0010 风险 | 低 | 高 | 低 |',
                '',
                '> **建议**: 级联模块间用 FIFO 传递，不要用 Wire + handshake — 手写容易丢数据。',
                '> 如果必须零延迟通路，用 Wire 但确保每个 cycle 都有值写入 + 下游有 valid 信号校验。',
            ],
        },
];

async function decide(input, level, cfg) {
    return '设计决策指导功能当前不可用。specmate 已从"建议系统"重构为"验证层"——' +
        '请自主完成架构设计，编码完成后用 `npx specmate check --full` 验证代码正确性。' +
        '\n\n编译失败时用 `npx specmate guide on_error "<bsc 错误输出>"` 获取修复方案。';
}

function patternPhase(input, level, cfg) {
    const keywords = extractKeywords(input);
    const results = searchPatterns(keywords);

    if (results.length === 0) {
        if (LEVEL_LIMITS[level].mode === 'passive') return `没有匹配到 "${input.slice(0, 50)}" 的范式模板。`;
        const av = searchPatterns(['fifo', 'bram', 'fsm']).map(p => '  ' + p.name).join('\n');
        return `没找到匹配 "${input}" 的范式。已支持的范式:\n${av}\n\n用更具体的描述，如 "FIFO" / "AXI4 Stream" / "SPI Master"。`;
    }

    const top = results[0];
    const lines = [
        `## 🧩 ${top.name} — 代码范式`,
        '',
    ];

    const variantCount = LEVEL_LIMITS[level].mode === 'passive' ? 1 : LEVEL_LIMITS[level].mode === 'suggestive' ? 3 : Object.keys(top.variants).length;
    if (LEVEL_LIMITS[level].mode !== 'passive') {
        lines.push('### 变体选择');
        const keys = Object.keys(top.variants).slice(0, variantCount);
        for (const k of keys) {
            lines.push(`  • ${k}: ${top.variants[k]}`);
        }
        if (variantCount < Object.keys(top.variants).length) {
            lines.push(`  → 提升 SPECMATE_LEVEL 查看全部 ${Object.keys(top.variants).length} 种变体`);
        }
        lines.push('');
    }

    lines.push('### 代码骨架');
    lines.push('```bsv');
    lines.push(top.skeleton);
    lines.push('```');
    lines.push('');

    if (top.traps.length > 0 && LEVEL_LIMITS[level].mode !== 'passive') {
        lines.push('### ⚠ 陷阱');
        for (const t of top.traps) {
            lines.push(`  • ${t}`);
        }
        lines.push('');
    }

    if (top.cross && top.cross.length > 0 && LEVEL_LIMITS[level].mode !== 'passive') {
        lines.push(`### 📖 参考: ${top.cross.map(t => `lookup_ref(topic="${t}")`).join(', ')}`);
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Phase 1: Unified scan() — replaces the need for Agent to call 5 phases
// Internally routes: trap matching → DECISIONS check → preflight → NEXT STEPS
// ---------------------------------------------------------------------------

/**
 * Check if the task description matches any DECISIONS entry.
 * Returns a formatted string or null if no match.
 */
function checkDecisions(input, cfg) {
    if (cfg && cfg.mode === 'passive') return null;
    const lower = input.toLowerCase();

    for (const decision of DECISIONS) {
        const allMatch = decision.keywords.every(kw => lower.includes(kw));
        if (allMatch) {
            return [
                `**${decision.title}**`,
                '',
                ...decision.body,
            ].join('\n');
        }
    }
    return null;
}

/**
 * Unified scan — the main entry point for CLI/MCP.
 * Post-refactor (2026-07-14): specmate no longer does active guidance.
 * Only shows UNIVERSAL_TRAPS (core safety rules) + preflight AST scan results.
 * Agent is told to write code autonomously and verify with specmate check.
 *
 * @param {string} taskDescription — what the Agent is about to code
 * @param {string|null} filePath — optional .bsv file for AST preflight scan
 * @returns {string} structured text output
 */
export async function scan(taskDescription, filePath = null) {
    const level = getLevel();
    const cfg = LEVEL_LIMITS[level];
    const lines = [];

    // ── UNIVERSAL_TRAPS: core safety rules ──
    const groupedByMode = filterTrapsByMode(UNIVERSAL_TRAPS, cfg.mode);
    const universalTraps = groupedByMode.hard;
    if (universalTraps.length > 0) {
        lines.push('## ⚠ 编译硬约束（必须遵守）');
        lines.push('');
        for (let i = 0; i < universalTraps.length; i++) {
            lines.push(`  ${i + 1}. ${universalTraps[i].text}`);
        }
        lines.push('');
    }

    // ── Message: specmate does not do active guidance ──
    lines.push('---');
    lines.push('');
    lines.push('> **specmate 当前不做主动设计指导。**');
    lines.push('> 请用最保守的 BSV 写法自主完成架构：Bit#(1) 不用 Bool、显式 guard 不用 always_ready、');
    lines.push('> 子接口组织、手写 state register 不用 StmtFSM、跨 rule 数据用 FIFOF 传递。');
    lines.push('> **编码完成后运行 `npx specmate check --full` 验证代码正确性。**');
    lines.push('');

    // ── Preflight AST scan (auto-capture issues) ──
    if (filePath && cfg.mode !== 'passive') {
        try {
            const parsed = parseFile(filePath);
            if (parsed) {
                const astIssues = scanAST(parsed);

                if (astIssues.length > 0) {
                    lines.push('---');
                    lines.push('### 🔍 预编译扫描结果 (specmate preflight)');
                    lines.push('');
                    for (const issue of astIssues) {
                        if (issue.line > 0) {
                            lines.push(`- **${issue.code}** (行${issue.line}): ${issue.detail}`);
                        } else {
                            lines.push(`- **${issue.code}**: ${issue.detail}`);
                        }
                    }
                    lines.push('');
                    lines.push('> 这些是 specmate 用 AST 直接扫描你的 .bsv 文件发现的——**不需要跑 bsc**。');
                    lines.push('> 修完这些问题再编译，首编通过率大幅提升。');
                    lines.push('');

                    // Auto-capture preflight issues
                    for (const issue of astIssues) {
                        addCapture({
                            code: issue.code,
                            bsc_output: `preflight: ${issue.title} — ${issue.detail}`,
                            files: filePath,
                        }).catch(() => {});
                    }
                } else {
                    lines.push('---');
                    lines.push('### 🔍 预编译扫描结果');
                    lines.push('');
                    lines.push('未发现 P0030/P0005/T0043/G0053/G0005/G0004 模式。');
                    lines.push('');
                }
            }
        } catch (_) { /* preflight is non-critical */ }
    }

    // ── NEXT STEPS: only passive verification ──
    if (cfg.mode !== 'passive') {
        lines.push('---');
        lines.push('### 📋 接下来');
        if (filePath) {
            lines.push(`- 编码完成后运行 \`npx specmate check ${filePath} --full\` 验证代码正确性`);
        } else {
            lines.push('- 编码完成后运行 `npx specmate check <文件路径> --full` 验证代码正确性');
        }
        lines.push('- 编译失败时运行 `npx specmate guide on_error "<bsc 错误输出>"` 获取修复方案');
        lines.push('');
    }

    if (lines.length === 0) {
        return 'specmate 当前不做主动指导。请用最保守的 BSV 写法自主完成架构，编码完成后运行 `npx specmate check --full` 验证。';
    }
    return lines.join('\n');
}
