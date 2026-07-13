import { extractKeywords, match, filterTrapsByMode, filterTrapsByPhase, formatTrapsOutput, inferPhase } from './_matcher.mjs';
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
    const keywords = extractKeywords(input);
    const m = match(keywords);
    const lines = [];

    // Pillar 2: infer the Agent's design phase and filter traps accordingly
    const agentPhase = inferPhase(input);

    // Pillar 1a: run AST preflight if a file path is provided
    let preflightResult = null;
    if (file && cfg.mode !== 'passive') {
        try {
            preflightResult = await preflight(file);
        } catch (_) { /* preflight is non-critical */ }
    }

    if (m.traps.length > 0) {
        // Use phase-aware filtering (pillar 2)
        const grouped = filterTrapsByPhase(m.traps, cfg.mode, agentPhase);
        const totalVisible = grouped.hard.length + grouped.quality.length + grouped.style.length;

        if (totalVisible > 0) {
            // Show phase indicator so Agent knows what's being shown
            const phaseLabel = agentPhase === 'design' ? '架构阶段' : '编码阶段';
            lines.push(`> 🎯 检测到你在 **${phaseLabel}** — 只展示该阶段相关的陷阱。`);
            lines.push('');
            lines.push(formatTrapsOutput(grouped, cfg.mode));
        } else if (cfg.mode === 'passive') {
            // passive 模式下如果所有 trap 都是 quality/style，给一条提示
            lines.push('没有匹配到编译级硬约束。提升 SPECMATE_LEVEL 查看代码质量和风格建议。');
            lines.push('');
        } else {
            lines.push('');
        }
    } else {
        // No traps matched at all
        lines.push('');
    }

    if (m.errors.length > 0 && LEVEL_LIMITS[level].mode !== 'passive') {
        const topRules = await queryTopRules(10);
        const relevant = topRules.filter(r => m.errors.includes(r.code));
        if (relevant.length > 0) {
            lines.push('📊 相关编码记忆:');
            for (const r of relevant.slice(0, cfg.errors)) {
                lines.push(`  ${r.code} — ${r.title} (×${r.count})`);
            }
            lines.push('');
        }
    }

    if (m.refs.length > 0 && LEVEL_LIMITS[level].mode !== 'passive') {
        lines.push(`📖 参考: ${m.refs.map(r => `lookup_ref(topic="${r}")`).join(', ')}`);
        lines.push('');
    }

    if (m.styles.length > 0 && cfg.styleHint) {
        lines.push(`🎨 推荐风格: ${m.styles.join(', ')}`);
        lines.push('');
    }

    if (cfg.collabHint) {
        const hot = await queryHotTopics(3);
        if (hot.length > 0) {
            lines.push(`🔮 相关知识热点: ${hot.map(h => `\`${h.topic}\` (×${h.count})`).join(', ')}`);
            lines.push('');
        }
    }

    // Project memory: show recent captures from this project
    if (LEVEL_LIMITS[level].mode !== 'passive') {
        const recentCaps = await queryRecentCaptures(5);
        if (recentCaps.length > 0) {
            lines.push('📝 本项目近期捕获的错误:');
            for (const c of recentCaps) {
                const icon = c.status === 'resolved' ? '✅' : '⏳';
                const preview = (c.bsc_output || '').replace(/\n/g, ' ').substring(0, 80);
                lines.push(`  ${icon} ${c.code} — ${preview}`);
            }
            lines.push('');
        }
    }

    // ── Pillar 1a: preflight AST scan results embedded in response ──
    // This is the key change: instead of just hinting "you should check your code",
    // we actually run the check and show results. Agent always sees the response.
    if (file && preflightResult && cfg.mode !== 'passive') {
        // Extract only the AST scan section (the "代码静态扫描" part) from preflight output
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

    // ── Pillar 1a (continued): file path hint when no file provided ──
    if (!file && cfg.mode !== 'passive') {
        lines.push('---');
        lines.push('### 🔍 建议：传入文件路径以启用预编译扫描');
        lines.push('调用 `specmate_guide(phase="pre_code", input="...", file="路径.bsv")` 传入你的 .bsv 文件——');
        lines.push('specmate 会用 AST 直接扫描 P0030/P0005/T0043/G0053/G0005 五种高频错误，**不用等 bsc 编译**。');
        lines.push('');
    }

    // ── Pillar 3: structured NEXT STEPS — proactive guidance embedded in response ──
    const nextSteps = [];

    // Always suggest decide for common design choices
    nextSteps.push('`specmate_guide(phase="decide", input="选项A vs 选项B")` — 不确定选哪个模块/方案时');

    // Suggest check when file available
    if (file) {
        nextSteps.push('`specmate_check(files=["' + file + '"])` — 运行更多静态检查（位宽溢出、Bool误用等）');
    }

    // Suggest analyze for schedule/rule-related tasks
    const hasScheduleMatch = keywords.some(k => ['schedule', 'rule', 'method', 'regfile', 'arbiter'].includes(k));
    if (hasScheduleMatch) {
        nextSteps.push('`specmate_analyze(files=["..."], question="调度冲突分析")` — 写完 rule 后做跨 rule 冲突检查');
    }

    if (nextSteps.length > 0 && cfg.mode !== 'passive') {
        lines.push('---');
        lines.push('### 📋 接下来可以做什么');
        for (const step of nextSteps) {
            lines.push(`- ${step}`);
        }
        lines.push('');
    }

    // Defensive: with UNIVERSAL_TRAPS always injected, this branch is unlikely to trigger,
    // but kept as a safety net in case UNIVERSAL_TRAPS is ever empty or filtered out.
    if (lines.length === 0) {
        if (LEVEL_LIMITS[level].mode === 'passive') return '没有匹配到已知陷阱。提升 SPECMATE_LEVEL 查看详细分析。';
        return `没有匹配到 "${input}" 的已知陷阱。尝试更具体的描述，或调 suggest。`;
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
    const lower = input.toLowerCase();

    // First try the expanded decision map (pillar 1b)
    for (const decision of DECISIONS) {
        // All keywords must be present
        const allMatch = decision.keywords.every(kw => lower.includes(kw));
        if (allMatch) {
            return [
                `### ${decision.title}`,
                '',
                ...decision.body,
            ].join('\n');
        }
    }

    // Fallback to keyword matching from GRAPH — show relevant reference topics
    const keywords = extractKeywords(input);
    const m = match(keywords);

    if (m.refs.length > 0) {
        return `对你的场景 ("${input.slice(0, 60)}")，参考:\n` +
            m.refs.map(r => `  📖 lookup_ref(topic="${r}")`).join('\n') +
            '\n\n没有明确的方案对比规则。具体描述两个选项我来分析。';
    }

    return `没有匹配到方案选择规则。描述两个具体选项，比如 "mkFIFO vs mkBypassFIFO"。`;
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
 * Replaces the old `pre_code` → manually call `decide` → manually call `preflight` workflow
 * with a single call that does everything automatically.
 *
 * @param {string} taskDescription — what the Agent is about to code
 * @param {string|null} filePath — optional .bsv file for AST preflight scan
 * @returns {string} structured text output (Agent sees via CLI stdout or MCP response)
 */
export async function scan(taskDescription, filePath = null) {
    const level = getLevel();
    const cfg = LEVEL_LIMITS[level];
    const keywords = extractKeywords(taskDescription);
    const m = match(keywords);
    const lines = [];

    // Phase inference (Pillar 2)
    const agentPhase = inferPhase(taskDescription);

    // ── SECTION 1: Traps (phase-aware, from GRAPH + UNIVERSAL_TRAPS) ──
    if (m.traps.length > 0) {
        const grouped = filterTrapsByPhase(m.traps, cfg.mode, agentPhase);
        const totalVisible = grouped.hard.length + grouped.quality.length + grouped.style.length;

        if (totalVisible > 0) {
            const phaseLabel = agentPhase === 'design' ? '架构阶段' : '编码阶段';
            lines.push(`> 🎯 检测到你在 **${phaseLabel}** — 只展示该阶段相关的陷阱。`);
            lines.push('');
            lines.push(formatTrapsOutput(grouped, cfg.mode));
        } else if (cfg.mode === 'passive') {
            lines.push('没有匹配到编译级硬约束。提升 SPECMATE_LEVEL 查看代码质量和风格建议。');
            lines.push('');
        }
    }

    // ── SECTION 2: DECISIONS (auto-check) — Task 4 ──
    const decisionResult = checkDecisions(taskDescription, cfg);
    if (decisionResult) {
        lines.push('---');
        lines.push('### 📐 设计决策建议');
        lines.push('');
        lines.push(decisionResult);
        lines.push('');
    }

    // ── SECTION 3: Error memory (from database) ──
    if (m.errors.length > 0 && cfg.mode !== 'passive') {
        const topRules = await queryTopRules(10);
        const relevant = topRules.filter(r => m.errors.includes(r.code));
        if (relevant.length > 0) {
            lines.push('📊 相关编码记忆:');
            for (const r of relevant.slice(0, cfg.errors)) {
                lines.push(`  ${r.code} — ${r.title} (×${r.count})`);
            }
            lines.push('');
        }
    }

    if (m.refs.length > 0 && cfg.mode !== 'passive') {
        lines.push(`📖 参考: ${m.refs.map(r => `lookup_ref(topic="${r}")`).join(', ')}`);
        lines.push('');
    }

    if (m.styles.length > 0 && cfg.styleHint) {
        lines.push(`🎨 推荐风格: ${m.styles.join(', ')}`);
        lines.push('');
    }

    // ── SECTION 4: Preflight AST scan (auto-capture issues) — Task 3 ──
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

                    // Task 3: auto-capture preflight issues — Agent doesn't need to know
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
                    lines.push('未发现 P0030/P0005/T0043/G0053/G0005 模式。');
                    lines.push('');
                }
            }
        } catch (_) { /* preflight is non-critical */ }
    }

    // ── SECTION 5: Project memory (recent captures) ──
    if (cfg.mode !== 'passive') {
        const recentCaps = await queryRecentCaptures(5);
        if (recentCaps.length > 0) {
            lines.push('📝 本项目近期捕获的错误:');
            for (const c of recentCaps) {
                const icon = c.status === 'resolved' ? '✅' : '⏳';
                const preview = (c.bsc_output || '').replace(/\n/g, ' ').substring(0, 80);
                lines.push(`  ${icon} ${c.code} — ${preview}`);
            }
            lines.push('');
        }
    }

    // ── SECTION 6: NEXT STEPS (Pillar 3) ──
    const nextSteps = [];

    // Always suggest decide for common design choices
    if (!decisionResult) {
        nextSteps.push('`specmate scan "选项A vs 选项B"` — 不确定选哪个方案时，用 scan 会自动给出设计建议');
    }

    if (filePath) {
        nextSteps.push('`specmate check "' + filePath + '"` — 运行更多静态检查（位宽溢出、Bool误用等）');
    }

    const hasScheduleMatch = keywords.some(k => ['schedule', 'rule', 'method', 'regfile', 'arbiter'].includes(k));
    if (hasScheduleMatch) {
        nextSteps.push('`specmate_analyze(files=["..."], question="调度冲突分析")` — 写完 rule 后做跨 rule 冲突检查');
    }

    // ── lookup_example integration: keyword → example recommendation ──
    const exampleKeywordMap = {
        fifo: 'fifo', mkfifo: 'fifo', bypass: 'fifo', pipeline: 'fifo', syncfifo: 'fifo',
        i2c: 'i2c', spi: 'spi', uart: 'uart', gpio: 'gpio',
        bram: 'bram', sram: 'bram', memory: 'bram',
        fsm: 'fsm', state: 'fsm', 'state machine': 'fsm', stmtfsm: 'fsm',
        crc: 'crc', checksum: 'crc',
        arbiter: 'arbiter', arbitration: 'arbiter', priority: 'arbiter',
        axi: 'axi', axilite: 'axi', axistream: 'axi',
        register: 'register', regfile: 'register', control: 'register',
        dma: 'dma', 'direct memory': 'dma',
        counter: 'counter', timer: 'counter',
        shift: 'shifter', barrel: 'shifter',
        encoder: 'encoder', decoder: 'decoder',
        gray: 'gray', 'grey code': 'gray', cdc: 'gray',
    };
    const seenExamples = new Set();
    const exampleRecs = [];
    for (const kw of keywords) {
        const mapped = exampleKeywordMap[kw.toLowerCase()];
        if (mapped && !seenExamples.has(mapped)) {
            seenExamples.add(mapped);
            exampleRecs.push('`npx specmate example ' + mapped + '`');
        }
    }
    // Also check taskDescription for extra domain keywords
    const taskLower = taskDescription.toLowerCase();
    for (const [domainKw, exampleKw] of Object.entries(exampleKeywordMap)) {
        if (taskLower.includes(domainKw) && !seenExamples.has(exampleKw)) {
            seenExamples.add(exampleKw);
            exampleRecs.push('`npx specmate example ' + exampleKw + '`');
        }
    }
    if (exampleRecs.length > 0 && cfg.mode !== 'passive') {
        const maxRecs = 3;
        const displayRecs = exampleRecs.slice(0, maxRecs);
        nextSteps.push(displayRecs.join(' | ') + ' — 搜索 BSC 官方示例参考');
    }

    // ── suggest routing: matched error codes → lookup_ref recommendation ──
    const errorTopicMap = {
        G0004: 'schedule', G0005: 'schedule', G0010: 'schedule',
        T0061: 'types',
        P0005: 'keywords',
        P0030: 'module', P0032: 'module',
        T0004: 'stdlib', T0011: 'stdlib',
    };
    const topicLabels = {
        schedule: '调度注解和 G0004 修复模式',
        types: 'Bool vs Bit#(1) 类型系统',
        keywords: 'BSV 保留字和 SV 关键字黑名单',
        module: '标准模块结构和 method 语法',
        stdlib: 'FIFO/Reg/Vector 标准库速查',
    };
    const seenTopics = new Set();
    // From matched errors
    for (const e of (m.errors || [])) {
        const topic = errorTopicMap[e.code];
        if (topic && !seenTopics.has(topic)) {
            seenTopics.add(topic);
        }
    }
    // From taskDescription directly
    const errorCodePattern = /\b(G\d{4}|P\d{4}|T\d{4})\b/g;
    for (const match of taskDescription.matchAll(errorCodePattern)) {
        const topic = errorTopicMap[match[0]];
        if (topic && !seenTopics.has(topic)) seenTopics.add(topic);
    }
    if (seenTopics.size > 0 && cfg.mode !== 'passive') {
        for (const topic of seenTopics) {
            const label = topicLabels[topic] || topic;
            nextSteps.push('`lookup_ref(topic="' + topic + '")` — 查看' + label);
        }
    }

    if (nextSteps.length > 0 && cfg.mode !== 'passive') {
        lines.push('---');
        lines.push('### 📋 接下来可以做什么');
        for (const step of nextSteps) {
            lines.push(`- ${step}`);
        }
        lines.push('');
    }

    // Safety net
    if (lines.length === 0) {
        if (cfg.mode === 'passive') return '没有匹配到已知陷阱。提升 SPECMATE_LEVEL 查看详细分析。';
        return `没有匹配到 "${taskDescription}" 的已知陷阱。尝试更具体的描述。`;
    }

    return lines.join('\n');
}
