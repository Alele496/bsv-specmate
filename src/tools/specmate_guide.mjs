import { extractKeywords, match } from './_matcher.mjs';
import { searchPatterns } from './_patterns.mjs';
import { queryError, queryAllErrors, queryTopRules, queryHotTopics, hitError, addCapture, queryRecentCaptures } from '../db/query.mjs';
import { lookupRef } from './lookup_ref.mjs';
import { getLevel, LEVEL_LIMITS } from '../config.mjs';
import { parseFile, queryNodeAt } from './ast_query.mjs';

export async function guide({ phase, input }) {
    const level = getLevel();
    const cfg = LEVEL_LIMITS[level];

    switch (phase) {
        case 'pre_code': return preCode(input, level, cfg);
        case 'on_error': return onError(input, level, cfg);
        case 'continue': return continue_(input, level, cfg);
        case 'decide': return decide(input, level, cfg);
        case 'pattern': return patternPhase(input, level, cfg);
        default: return `Unknown phase "${phase}". Use: pre_code, on_error, continue, decide, pattern.`;
    }
}

async function preCode(input, level, cfg) {
    const keywords = extractKeywords(input);
    const m = match(keywords);
    const lines = [];

    if (m.traps.length > 0) {
        const count = cfg === LEVEL_LIMITS.silicon ? 1 : cfg === LEVEL_LIMITS.wafer ? Math.min(4, m.traps.length) : m.traps.length;
        lines.push(`⚠ 当前任务高频陷阱 (${count}):`);
        for (let i = 0; i < count; i++) {
            lines.push(`  ${i + 1}. ${m.traps[i]}`);
        }
        if (level === 'silicon' && m.traps.length > 1) {
            lines.push(`  → 还有 ${m.traps.length - 1} 条，提升 SPECMATE_LEVEL 查看更多`);
        }
        lines.push('');
    }

    if (m.errors.length > 0 && level !== 'silicon') {
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

    if (m.refs.length > 0 && level !== 'silicon') {
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
    if (level !== 'silicon') {
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

    if (cfg.collabHint) {
        lines.push('💬 需要展开某个陷阱，或选方案时可以调 specmate_guide(phase="decide")。');
    }

    if (lines.length === 0) {
        if (level === 'silicon') return '没有匹配到已知陷阱。提升 SPECMATE_LEVEL 查看详细分析。';
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
    if (err) hitError(code).catch(() => {});

    // Auto-capture: log every on_error query for project memory (fire-and-forget)
    addCapture({ code, bsc_output: input, files: null }).catch(() => {});

    if (!err) {
        if (level === 'silicon') {
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

    if (level === 'silicon') {
        return [
            `## ${err.code} — ${err.title} (×${err.count})`,
            '',
            '> ' + (err.rules || err.cause?.substring(0, 200) || ''),
            '',
            '提升 SPECMATE_LEVEL=wafer 或 tapeout 查看完整方案。',
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
        lines.push('🔮 接下来可能遇到:');
        const count = level === 'silicon' ? 1 : cfg === LEVEL_LIMITS.wafer ? Math.min(3, m.traps.length) : m.traps.length;
        for (let i = 0; i < count; i++) {
            lines.push(`  • ${m.traps[i]}`);
        }
        lines.push('');
    }

    if (m.errors.length > 0 && level !== 'silicon') {
        lines.push(`⚠ 相关错误码: ${m.errors.join(', ')}`);
        lines.push(`  编译后如果遇到，直接 specmate_guide(phase="on_error", input="错误码")`);
        lines.push('');
    }

    if (m.refs.length > 0 && level !== 'silicon') {
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

async function decide(input, level, cfg) {
    const lower = input.toLowerCase();

    if (lower.includes('fifo') && lower.includes('bypass')) {
        return [
            '### mkFIFO vs mkBypassFIFO',
            '',
            '| | mkFIFO | mkBypassFIFO |',
            '|------|--------|-------------|',
            '| 同周期 enq/deq | ❌ 不可 | ✅ 可 (Bypass) |',
            '| G0010 风险 | 低 (CF) | 高 (需 extra scheduling) |',
            '| 适用场景 | 无 bypass 需求 | 需要组合逻辑通路 |',
            '',
            '> **建议**: 除非明确需要 bypass，否则用 mkFIFO。',
            '> 如果用 BypassFIFO，检查 enq/deq 是否跨 rule — G0010 高频触发。',
        ].join('\n');
    }

    if (lower.includes('bram') && (lower.includes('core') || lower.includes('bramcore'))) {
        return [
            '### BRAM vs BRAMCore',
            '',
            '| | BRAM | BRAMCore |',
            '|------|-------|----------|',
            '| 读写端口 | 单端口 | 双端口 (可配置) |',
            '| 接口 | 简单 Put/Get | 原生 BRAM signal |',
            '| G0004 风险 | 中 | 低 (显式 port 控制) |',
            '',
            '> **建议**: 需要同时读写用 BRAMCore，简单 FIFO 缓冲用 BRAM。',
            '> BRAMCore 需要手动管理 enable 和地址。',
        ].join('\n');
    }

    if (lower.includes('reg') && lower.includes('config')) {
        return [
            '### Reg vs ConfigReg',
            '',
            '| | Reg | ConfigReg |',
            '|------|-----|-----------|',
            '| 写入冲突检查 | G0004 显式报错 | ConfigReg 优先上次写入 |',
            '| 调度参与 | 是 | 否 (schedule CF) |',
            '',
            '> **建议**: 配置寄存器用 ConfigReg（避免调度告警），计算用 Reg。',
        ].join('\n');
    }

    if (lower.includes('wire') && lower.includes('reg')) {
        return [
            '### Wire vs Reg',
            '',
            '| | Wire | Reg |',
            '|------|------|-----|',
            '| 值保持 | 每个 cycle 刷新 | 保持到下次写入 |',
            '| 时机 | 同 cycle 可读 | 下一 cycle 可见 |',
            '| 用途 | 组合逻辑连接 | 时序状态 |',
            '',
            '> **建议**: 默认用 Reg。Wire 用于组合逻辑传递，且需确保每个 cycle 都有值写入。',
        ].join('\n');
    }

    if (lower.includes('fifo') || lower.includes('fifof')) {
        return [
            '### FIFO 变体选择',
            '',
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
            `📖 lookup_ref(topic="stdlib") 查看每种 FIFO 的接口定义。`,
        ].join('\n');
    }

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
        if (level === 'silicon') return `没有匹配到 "${input.slice(0, 50)}" 的范式模板。`;
        const av = searchPatterns(['fifo', 'bram', 'fsm']).map(p => '  ' + p.name).join('\n');
        return `没找到匹配 "${input}" 的范式。已支持的范式:\n${av}\n\n用更具体的描述，如 "FIFO" / "AXI4 Stream" / "SPI Master"。`;
    }

    const top = results[0];
    const lines = [
        `## 🧩 ${top.name} — 代码范式`,
        '',
    ];

    const variantCount = cfg === LEVEL_LIMITS.silicon ? 1 : cfg === LEVEL_LIMITS.wafer ? 3 : Object.keys(top.variants).length;
    if (level !== 'silicon') {
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

    if (top.traps.length > 0 && level !== 'silicon') {
        lines.push('### ⚠ 陷阱');
        for (const t of top.traps) {
            lines.push(`  • ${t}`);
        }
        lines.push('');
    }

    if (top.cross && top.cross.length > 0 && level !== 'silicon') {
        lines.push(`### 📖 参考: ${top.cross.map(t => `lookup_ref(topic="${t}")`).join(', ')}`);
    }

    return lines.join('\n');
}
