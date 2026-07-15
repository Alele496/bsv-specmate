// severity levels for traps:
//   hard    — 不遵守会触发编译错误（所有模式下都显示）
//   quality — 不影响编译，但影响硬件质量和代码正确性（develop + tapeout 显示）
//   style   — 纯粹的风格偏好（仅 tapeout 显示）
//
// phase for traps (pillar 2 — stage-aware SPP):
//   design  — 架构/模块选型/调度设计阶段才推送（FIFO 选型、时钟方案、互联拓扑）
//   code    — 编码/语法/类型检查阶段推送（Bool/Bit、操作符、method 顺序）
//   both    — 两个阶段都推送（通用硬约束）
//
// bscVersions for traps (QA pillar — knowledge versioning):
//   ['2025.07'] — 知识适用于 BSC 2025.07（默认新版本）
//   ['legacy']  — 知识仅适用于旧版 BSC，保留用于兼容参考
//
// verified for traps (QA pillar — validation status):
//   false — 尚未经过编译验证
//   true  — 已通过 fixture 编译验证，需附带 verifiedAt 字段

// Universal traps — always shown regardless of domain keyword match
const UNIVERSAL_TRAPS = [
    { text: 'function 内 return 只能在末尾 — 不可在 for/if 块中间 return（P0030）。需要提前退出的场景用 flag 变量 + 末尾 return', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false, alwaysShow: true },
    { text: '【P0005】function 关键字在模块内是 Verilog-2001 保留字，bsc 直接拒绝编译。genWith/map/fold/findIndex 的回调绝不可写 function(Integer i)...endfunction。正确写法：`genWith(requests, \\\\== (1))` 用部分应用，或把逻辑提取到模块外的独立 function 再引用。错误示范：`genWith(function(Integer i); return requests[i]; endfunction)` — 这会被 bsc 拒绝。', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false, alwaysShow: true },
];

const GRAPH = {
    fifo: {
        errors: ['G0010', 'G0004'],
        refs: ['stdlib', 'schedule'],
        style: 'engineering',
        pattern: 'fifo',
        traps: [
            { text: 'mkFIFO vs mkFIFO1 — mkFIFO1 允许同周期 enq/deq（旁路 FIFO），但满时有调度冲突风险（G0010）。数据缓冲用 mkFIFO，握手信号/控制路径用 mkFIFO1', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-14' },
        ],
    },
    pipeline: {
        errors: ['G0004', 'G0010'],
        refs: ['patterns', 'schedule'],
        style: 'engineering',
        pattern: 'pipeline',
        traps: [],
    },
    clock: {
        errors: ['BSV-PORTS'],
        refs: ['module', 'attributes'],
        pattern: 'clock_cross',
        traps: [],
    },
    reset: {
        errors: [],
        refs: ['module'],
        traps: [],
    },
    axi: {
        errors: ['BSV-PORTS', 'G0010'],
        refs: ['module', 'attributes', 'patterns'],
        style: 'engineering',
        pattern: 'axi_stream',
        traps: [],
    },
    bram: {
        errors: ['G0004', 'T0060'],
        refs: ['stdlib'],
        pattern: 'bram',
        traps: [],
    },
    fsm: {
        errors: ['G0004_FSM', 'P0030', 'G0010'],
        refs: ['patterns', 'module'],
        style: 'safe',
        pattern: 'fsm',
        traps: [],
    },
    bvi: {
        errors: ['P0005', 'G0124', 'P0022', 'P0200'],
        refs: ['attributes'],
        pattern: 'bvi',
        traps: [],
    },
    spi: {
        errors: ['T0051', 'T0060'],
        refs: ['stdlib'],
        pattern: 'spi',
        traps: [],
    },
    crc: {
        errors: ['T0060', 'T0061'],
        refs: ['types'],
        pattern: 'crc',
        traps: [],
    },
    uart: {
        errors: ['T0051', 'T0060'],
        refs: ['stdlib'],
        pattern: 'uart',
        traps: [],
    },
    struct: {
        errors: ['T0016', 'P0073'],
        refs: ['structs', 'types'],
        traps: [],
    },
    union: {
        errors: ['T0144', 'T0016'],
        refs: ['unions', 'types'],
        traps: [],
    },
    attribute: {
        errors: ['P0085', 'G0054', 'G0030', 'G0040', 'P0022'],
        refs: ['attributes'],
        traps: [],
    },
    interface: {
        errors: ['P0073', 'G0010'],
        refs: ['module', 'patterns'],
        traps: [],
    },
    rule: {
        errors: ['G0004', 'G0010', 'G0054', 'G0030'],
        refs: ['schedule'],
        traps: [],
    },
    method: {
        errors: ['P0032', 'P0030', 'T0011', 'P0022'],
        refs: ['module'],
        traps: [],
    },
    types: {
        errors: ['T0061', 'T0051', 'T0060', 'T0132'],
        refs: ['types'],
        traps: [],
    },
    vector: {
        errors: ['T0004'],
        refs: ['stdlib', 'types'],
        traps: [],
    },
    schedule: {
        errors: ['G0004', 'G0010', 'G0030', 'G0040', 'G0054', 'G0005', 'G0036'],
        refs: ['schedule'],
        traps: [],
    },
    regfile: {
        errors: ['G0002', 'G0053'],
        refs: ['stdlib'],
        pattern: 'regfile',
        traps: [],
    },
    arbiter: {
        errors: ['G0002', 'G0004'],
        refs: ['stdlib', 'patterns'],
        pattern: 'arbiter',
        traps: [],
    },
    serialize: {
        errors: ['T0051', 'T0060'],
        refs: ['types'],
        pattern: 'serialize',
        traps: [],
    },
    interrupt: {
        errors: ['T0060', 'T0061'],
        refs: ['types', 'patterns'],
        pattern: 'interrupt',
        traps: [],
    },
    dma: {
        errors: ['G0010', 'G0004'],
        refs: ['patterns', 'schedule', 'stdlib'],
        traps: [],
    },
    encoder: {
        errors: ['T0060', 'T0051'],
        refs: ['types', 'stdlib'],
        pattern: 'encoder',
        traps: [],
    },
    decoder: {
        errors: ['T0060', 'T0051'],
        refs: ['types', 'patterns'],
        traps: [],
    },
    timer: {
        errors: ['T0060', 'T0051', 'G0004'],
        refs: ['stdlib', 'types'],
        traps: [],
    },
    gpio: {
        errors: ['T0061', 'BSV-PORTS'],
        refs: ['module', 'types'],
        traps: [],
    },
    synthesize: {
        errors: ['T0030', 'P0085', 'T0043', 'G0010'],
        refs: ['module', 'attributes'],
        traps: [],
    },
};

const KEYWORDS = Object.keys(GRAPH);

export function extractKeywords(text) {
    const lower = text.toLowerCase();
    const found = [];
    for (const kw of KEYWORDS) {
        if (lower.includes(kw)) found.push(kw);
    }
    return found;
}

function dedupTraps(traps) {
    const seen = new Set();
    const result = [];
    for (const t of traps) {
        const key = t.text;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(t);
        }
    }
    return result;
}

export function match(keywords) {
    const merged = { errors: new Set(), refs: new Set(), styles: new Set(), traps: [...UNIVERSAL_TRAPS], patterns: [] };
    for (const kw of keywords) {
        if (!GRAPH[kw]) continue;
        const node = GRAPH[kw];
        for (const e of (node.errors || [])) merged.errors.add(e);
        for (const r of (node.refs || [])) merged.refs.add(r);
        if (node.style) merged.styles.add(node.style);
        if (node.traps) merged.traps.push(...node.traps);
        if (node.pattern) merged.patterns.push(node.pattern);
    }
    return {
        errors: [...merged.errors],
        refs: [...merged.refs],
        styles: [...merged.styles],
        traps: dedupTraps(merged.traps),
        patterns: [...new Set(merged.patterns)],
    };
}

/**
 * 按 SPECMATE_LEVEL 对应的 mode 过滤 traps
 * @param {Array} traps - match() 返回的 traps 数组
 * @param {'passive'|'suggestive'|'collaborative'} mode
 * @returns {{ hard: Array, quality: Array, style: Array }}
 */
export function filterTrapsByMode(traps, mode) {
    const hard = traps.filter(t => t.severity === 'hard');
    const quality = traps.filter(t => t.severity === 'quality');
    const style = traps.filter(t => t.severity === 'style');

    if (mode === 'passive') {
        return { hard, quality: [], style: [] };
    }
    if (mode === 'suggestive') {
        return { hard, quality, style: [] };
    }
    // collaborative (tapeout)
    return { hard, quality, style };
}

/**
 * 将分级的 traps 格式化为面向 Agent 的输出文本
 */
export function formatTrapsOutput(grouped, mode) {
    // Filter out unverified traps. Only verified traps and alwaysShow traps
    // (core safety rules like P0030/P0005) are visible to the Agent.
    const showFilter = (t) => t.verified !== false || t.alwaysShow === true;
    const hard = grouped.hard.filter(showFilter);
    const quality = grouped.quality.filter(showFilter);
    const style = grouped.style.filter(showFilter);

    const lines = [];

    if (hard.length > 0) {
        lines.push('## ⚠ 编译硬约束（不遵守会报错）');
        lines.push('');
        for (let i = 0; i < hard.length; i++) {
            lines.push(`  ${i + 1}. ${hard[i].text}`);
        }
        lines.push('');
    }

    if (quality.length > 0) {
        lines.push('## 📐 代码质量（不影响编译，影响硬件正确性）');
        lines.push('');
        for (let i = 0; i < quality.length; i++) {
            lines.push(`  ${i + 1}. ${quality[i].text}`);
        }
        lines.push('');
    }

    if (style.length > 0 && mode === 'collaborative') {
        lines.push('## 🎨 风格建议（可选，影响代码优雅度）');
        lines.push('');
        for (let i = 0; i < style.length; i++) {
            lines.push(`  ${i + 1}. ${style[i].text}`);
        }
        lines.push('');
    }

    if (lines.length === 0) {
        lines.push('没有匹配到已知陷阱。尝试更具体的描述，或调 suggest。');
    }

    return lines.join('\n');
}

/**
 * Infer the Agent's design phase from input text.
 * Returns 'design' | 'code'.
 * Used by pillar 2 (stage-aware SPP) to filter which traps to push.
 *
 * Design keywords: architecture, module selection, clocking, connectivity
 * Code keywords: implementation, writing rules/methods, syntax
 */
export function inferPhase(input) {
    const lower = (input || '').toLowerCase();

    // Design-phase indicators — Agent is figuring out architecture
    const designKeywords = [
        '架构', '设计', 'architecture', 'design',
        '接口', 'interface', '模块划分', 'module partition',
        '时钟方案', 'clock scheme', 'clock domain', '跨时钟',
        '复位方案', 'reset scheme',
        '总线', 'bus', '互联', 'interconnect', '拓扑', 'topology',
        '选型', '选哪个', 'which', 'choose', 'vs', '对比',
        '数据流', 'dataflow', '流水线', 'pipeline',
        'FIFO', 'buf', 'buffer', '缓冲',
        '调度方案', 'scheduling', 'schedule',
        '模块', 'module', 'block diagram',
    ];

    for (const kw of designKeywords) {
        if (lower.includes(kw)) return 'design';
    }

    // Default to code phase
    return 'code';
}

/**
 * Filter traps by phase in addition to mode.
 * @param {Array} traps
 * @param {'passive'|'suggestive'|'collaborative'} mode
 * @param {'design'|'code'} phase - inferred phase, defaults to 'code'
 */
export function filterTrapsByPhase(traps, mode, phase = 'code') {
    // First filter by mode (severity)
    const modeFiltered = filterTrapsByMode(traps, mode);

    // Then filter by phase
    const phaseMatch = (trap) => !trap.phase || trap.phase === phase || trap.phase === 'both';

    return {
        hard: modeFiltered.hard.filter(phaseMatch),
        quality: modeFiltered.quality.filter(phaseMatch),
        style: modeFiltered.style.filter(phaseMatch),
    };
}

export { KEYWORDS, UNIVERSAL_TRAPS, GRAPH };
