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
    { text: 'function 内 return 只能在末尾 — 不可在 for/if 块中间 return（P0030）。需要提前退出的场景用 flag 变量 + 末尾 return', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
    { text: '【P0005】function 关键字在模块内是 Verilog-2001 保留字，bsc 直接拒绝编译。genWith/map/fold/findIndex 的回调绝不可写 function(Integer i)...endfunction。正确写法：`genWith(requests, \\\\== (1))` 用部分应用，或把逻辑提取到模块外的独立 function 再引用。错误示范：`genWith(function(Integer i); return requests[i]; endfunction)` — 这会被 bsc 拒绝。', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
];

const GRAPH = {
    fifo: {
        errors: ['G0010', 'G0004'],
        refs: ['stdlib', 'schedule'],
        style: 'engineering',
        pattern: 'fifo',
        traps: [
            { text: 'mkFIFO vs mkBypassFIFO — BypassFIFO 允许同周期 enq/deq 但会触发 G0010', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    pipeline: {
        errors: ['G0004', 'G0010'],
        refs: ['patterns', 'schedule'],
        style: 'engineering',
        pattern: 'pipeline',
        traps: [
            { text: '级联模块间用 FIFO 传递 data，不要用 Wire + handshake', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    clock: {
        errors: ['BSV-PORTS'],
        refs: ['module', 'attributes'],
        pattern: 'clock_cross',
        traps: [
            { text: 'Clock 类型需要 import Clocks::*', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: '跨时钟域用 mkSyncFIFO / mkSyncBRAMFIFO', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    reset: {
        errors: [],
        refs: ['module'],
        traps: [
            { text: 'Reset 类型需要显式 import', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'default_reset 在 BVI 中是 RST_N 而非 RST', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    axi: {
        errors: ['BSV-PORTS', 'G0010'],
        refs: ['module', 'attributes', 'patterns'],
        style: 'engineering',
        pattern: 'axi_stream',
        traps: [
            { text: 'AXI4 接口 port 名与 BSV method 名不一致 — 用 Verilog wrapper', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    bram: {
        errors: ['G0004', 'T0060'],
        refs: ['stdlib'],
        pattern: 'bram',
        traps: [
            { text: 'BRAMCore: 读/写端口分离, BRAM: 单端口 — 选对类型', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'BRAM 数据位宽 vs 外部总线位宽对齐', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    fsm: {
        errors: ['G0004_FSM', 'P0030', 'G0010'],
        refs: ['patterns', 'module'],
        style: 'safe',
        pattern: 'fsm',
        traps: [
            { text: 'StmtFSM 隐式并行写 — 避免同一 cycle 写同一 Reg', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'value method 不用 if-return，用 ?: 三元链', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    bvi: {
        errors: ['P0005', 'G0124'],
        refs: ['attributes'],
        pattern: 'bvi',
        traps: [
            { text: 'default_clock / default_reset 必须写', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'parameter width = valueOf(sz_a) — 位宽参数模板', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    spi: {
        errors: ['T0051', 'T0060'],
        refs: ['stdlib'],
        pattern: 'spi',
        traps: [
            { text: 'SPI 命令字 Bit#(8), 移位寄存器匹配', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'CS/SCK/MOSI/MISO 信号命名统一', severity: 'style', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    crc: {
        errors: ['T0060', 'T0061'],
        refs: ['types'],
        pattern: 'crc',
        traps: [
            { text: 'CRC 多项式位宽确认', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: "Bool vs Bit#(1) 区分 — 'done' 信号用 Bool", severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    uart: {
        errors: ['T0051', 'T0060'],
        refs: ['stdlib'],
        pattern: 'uart',
        traps: [
            { text: '波特率分频用 Bit#(n) 而非 Integer', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'UART 帧格式 start + 8bit + stop', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    struct: {
        errors: ['T0016', 'P0073'],
        refs: ['structs', 'types'],
        traps: [
            { text: 'struct 字段名拼写', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'struct 字面量用 MyStruct { field: val } 格式', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    union: {
        errors: ['T0144', 'T0016'],
        refs: ['unions', 'types'],
        traps: [
            { text: 'tagged 构造带数据的 tag 必须传参', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'union 字段不能 .field 直接访问 — 用 case matches', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    attribute: {
        errors: ['P0085', 'G0054', 'G0030', 'G0040'],
        refs: ['attributes'],
        traps: [
            { text: 'synthesize 不拼写成 synthesized', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'urgency 规则名必须在本模块中存在', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    interface: {
        errors: ['P0073', 'G0010'],
        refs: ['module', 'patterns'],
        traps: [
            { text: '接口方法名不能重复', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'interface instance 用 <- 而非 =', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    rule: {
        errors: ['G0004', 'G0010', 'G0054', 'G0030'],
        refs: ['schedule'],
        traps: [
            { text: '同一 rule 内同一 Reg 只写一次', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'urgency 属性避免循环', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    method: {
        errors: ['P0032', 'P0030', 'T0011'],
        refs: ['module'],
        traps: [
            { text: 'method 必须在所有 rule 之后', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'value method 用 = 而非 if-return', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    types: {
        errors: ['T0061', 'T0051', 'T0060', 'T0132'],
        refs: ['types'],
        traps: [
            { text: 'Bool 用 ! 不用 ~', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'Bit#(n) 位宽一致性', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'sized literal 不超位宽', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    vector: {
        errors: ['T0004'],
        refs: ['stdlib', 'types'],
        traps: [
            { text: 'vec() 在 BSC 2025.07 不可用 — 构造 Vector 用 genWith(fromInteger)', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'Vector 索引/遍历 用 findIndex/map/fold 等标准库函数，索引用 UInt 而非 Integer', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    schedule: {
        errors: ['G0004', 'G0010', 'G0030', 'G0040', 'G0054', 'G0005'],
        refs: ['schedule'],
        traps: [
            { text: 'descending_urgency 不循环', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'execution_order 用于 SE 而非 SB', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    regfile: {
        errors: ['G0002', 'G0053'],
        refs: ['stdlib'],
        pattern: 'regfile',
        traps: [
            { text: 'RegFile 最多 5 读端口 — 超出触发 G0002', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'mkRegFileFull vs mkRegFile 选型', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: '同 cycle 读写同地址 → G0004', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    arbiter: {
        errors: ['G0002', 'G0004'],
        refs: ['stdlib', 'patterns'],
        pattern: 'arbiter',
        traps: [
            { text: '同一 cycle 超 5 读端口 → G0002', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'winner 丢失 → 需缓冲 FIFO', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    serialize: {
        errors: ['T0051', 'T0060'],
        refs: ['types'],
        pattern: 'serialize',
        traps: [
            { text: 'shift reg 位宽对齐', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'cnt = log2(data_width) 位宽计算', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    interrupt: {
        errors: ['T0060', 'T0061'],
        refs: ['types', 'patterns'],
        pattern: 'interrupt',
        traps: [
            { text: 'IRQ 信号用 Bit#(n) 便于多中断检测', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'mask 位宽 vs pending 位宽对齐', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    dma: {
        errors: ['G0010', 'G0004'],
        refs: ['patterns', 'schedule', 'stdlib'],
        traps: [
            { text: 'DMA 描述符链用 FIFO 传递 — 不用 Wire', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'burst 传输注意地址对齐', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'DMA done 信号用 Bool 而非 Bit#(1)', severity: 'style', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    encoder: {
        errors: ['T0060', 'T0051'],
        refs: ['types', 'stdlib'],
        pattern: 'encoder',
        traps: [
            { text: '编码器输出位宽 = ceil(log2(input_width))', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: '优先编码器用 findIndex 查 Vector 中第一个满足条件的位（不用 foldl 手工遍历）', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: '输出 valid 信号用 Bit#(1) 不用 Bool', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: '索引用 UInt#(n) 不用 Integer', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    decoder: {
        errors: ['T0060', 'T0051'],
        refs: ['types', 'patterns'],
        traps: [
            { text: '译码输出位宽 = 2^input_width', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'one-hot 输出注意位宽膨胀', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: '组合逻辑 decoder 用 function 而非 rule', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    timer: {
        errors: ['T0060', 'T0051', 'G0004'],
        refs: ['stdlib', 'types'],
        traps: [
            { text: '计数器位宽 = ceil(log2(max_count))', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: '预分频器用 Bit#(n) 分频', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'timer done 用 Bool 避免位拼接冲突', severity: 'style', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    gpio: {
        errors: ['T0061', 'BSV-PORTS'],
        refs: ['module', 'types'],
        traps: [
            { text: 'GPIO 方向寄存器用 Bool 还是 Bit#(1) — 建议 Bit#(1) 可拼总线', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'GPIO inout 信号通过 BVI 机制处理：BSV interface 中定义独立的 data_in、data_out、oe（output enable）method，Verilog wrapper 中用 assign io = oe ? data_out : \'bz 实现三态控制。Inout#() 包装器属于旧版 BSC 库用法，BSC 2025.07 中不推荐直接使用', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: '输出端口在顶层模块直接接 method', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    synthesize: {
        errors: ['T0030', 'P0085', 'T0043'],
        refs: ['module', 'attributes'],
        traps: [
            { text: '多态模块不能直接 synthesize — 用具体类型包裹', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: '顶层模块加 (* synthesize *)', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
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
    const lines = [];

    if (grouped.hard.length > 0) {
        lines.push('## ⚠ 编译硬约束（不遵守会报错）');
        lines.push('');
        for (let i = 0; i < grouped.hard.length; i++) {
            lines.push(`  ${i + 1}. ${grouped.hard[i].text}`);
        }
        lines.push('');
    }

    if (grouped.quality.length > 0) {
        lines.push('## 📐 代码质量（不影响编译，影响硬件正确性）');
        lines.push('');
        for (let i = 0; i < grouped.quality.length; i++) {
            lines.push(`  ${i + 1}. ${grouped.quality[i].text}`);
        }
        lines.push('');
    }

    if (grouped.style.length > 0 && mode === 'collaborative') {
        lines.push('## 🎨 风格建议（可选，影响代码优雅度）');
        lines.push('');
        for (let i = 0; i < grouped.style.length; i++) {
            lines.push(`  ${i + 1}. ${grouped.style[i].text}`);
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
