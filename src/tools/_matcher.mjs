// severity levels for traps:
//   hard    — 不遵守会触发编译错误（所有模式下都显示）
//   quality — 不影响编译，但影响硬件质量和代码正确性（develop + tapeout 显示）
//   style   — 纯粹的风格偏好（仅 tapeout 显示）

// Universal traps — always shown regardless of domain keyword match
const UNIVERSAL_TRAPS = [
    { text: 'function 内 return 只能在末尾 — 不可在 for/if 块中间 return（P0030）。需要提前退出的场景用 flag 变量 + 末尾 return', severity: 'hard' },
];

const GRAPH = {
    fifo: {
        errors: ['G0010', 'G0004'],
        refs: ['stdlib', 'schedule'],
        style: 'engineering',
        pattern: 'fifo',
        traps: [
            { text: 'mkFIFO vs mkBypassFIFO — BypassFIFO 允许同周期 enq/deq 但会触发 G0010', severity: 'quality' },
        ],
    },
    pipeline: {
        errors: ['G0004', 'G0010'],
        refs: ['patterns', 'schedule'],
        style: 'engineering',
        pattern: 'pipeline',
        traps: [
            { text: '级联模块间用 FIFO 传递 data，不要用 Wire + handshake', severity: 'quality' },
        ],
    },
    clock: {
        errors: ['BSV-PORTS'],
        refs: ['module', 'attributes'],
        pattern: 'clock_cross',
        traps: [
            { text: 'Clock 类型需要 import Clocks::*', severity: 'hard' },
            { text: '跨时钟域用 mkSyncFIFO / mkSyncBRAMFIFO', severity: 'quality' },
        ],
    },
    reset: {
        errors: [],
        refs: ['module'],
        traps: [
            { text: 'Reset 类型需要显式 import', severity: 'hard' },
            { text: 'default_reset 在 BVI 中是 RST_N 而非 RST', severity: 'hard' },
        ],
    },
    axi: {
        errors: ['BSV-PORTS', 'G0010'],
        refs: ['module', 'attributes', 'patterns'],
        style: 'engineering',
        pattern: 'axi_stream',
        traps: [
            { text: 'AXI4 接口 port 名与 BSV method 名不一致 — 用 Verilog wrapper', severity: 'quality' },
        ],
    },
    bram: {
        errors: ['G0004', 'T0060'],
        refs: ['stdlib'],
        pattern: 'bram',
        traps: [
            { text: 'BRAMCore: 读/写端口分离, BRAM: 单端口 — 选对类型', severity: 'quality' },
            { text: 'BRAM 数据位宽 vs 外部总线位宽对齐', severity: 'quality' },
        ],
    },
    fsm: {
        errors: ['G0004_FSM', 'P0030', 'G0010'],
        refs: ['patterns', 'module'],
        style: 'safe',
        pattern: 'fsm',
        traps: [
            { text: 'StmtFSM 隐式并行写 — 避免同一 cycle 写同一 Reg', severity: 'quality' },
            { text: 'value method 不用 if-return，用 ?: 三元链', severity: 'hard' },
        ],
    },
    bvi: {
        errors: ['P0005', 'G0124'],
        refs: ['attributes'],
        pattern: 'bvi',
        traps: [
            { text: 'default_clock / default_reset 必须写', severity: 'hard' },
            { text: 'parameter width = valueOf(sz_a) — 位宽参数模板', severity: 'hard' },
        ],
    },
    spi: {
        errors: ['T0051', 'T0060'],
        refs: ['stdlib'],
        pattern: 'spi',
        traps: [
            { text: 'SPI 命令字 Bit#(8), 移位寄存器匹配', severity: 'quality' },
            { text: 'CS/SCK/MOSI/MISO 信号命名统一', severity: 'style' },
        ],
    },
    crc: {
        errors: ['T0060', 'T0061'],
        refs: ['types'],
        pattern: 'crc',
        traps: [
            { text: 'CRC 多项式位宽确认', severity: 'quality' },
            { text: "Bool vs Bit#(1) 区分 — 'done' 信号用 Bool", severity: 'quality' },
        ],
    },
    uart: {
        errors: ['T0051', 'T0060'],
        refs: ['stdlib'],
        pattern: 'uart',
        traps: [
            { text: '波特率分频用 Bit#(n) 而非 Integer', severity: 'quality' },
            { text: 'UART 帧格式 start + 8bit + stop', severity: 'quality' },
        ],
    },
    struct: {
        errors: ['T0016', 'P0073'],
        refs: ['structs', 'types'],
        traps: [
            { text: 'struct 字段名拼写', severity: 'hard' },
            { text: 'struct 字面量用 MyStruct { field: val } 格式', severity: 'hard' },
        ],
    },
    union: {
        errors: ['T0144', 'T0016'],
        refs: ['unions', 'types'],
        traps: [
            { text: 'tagged 构造带数据的 tag 必须传参', severity: 'hard' },
            { text: 'union 字段不能 .field 直接访问 — 用 case matches', severity: 'hard' },
        ],
    },
    attribute: {
        errors: ['P0085', 'G0054', 'G0030', 'G0040'],
        refs: ['attributes'],
        traps: [
            { text: 'synthesize 不拼写成 synthesized', severity: 'hard' },
            { text: 'urgency 规则名必须在本模块中存在', severity: 'hard' },
        ],
    },
    interface: {
        errors: ['P0073', 'G0010'],
        refs: ['module', 'patterns'],
        traps: [
            { text: '接口方法名不能重复', severity: 'hard' },
            { text: 'interface instance 用 <- 而非 =', severity: 'hard' },
        ],
    },
    rule: {
        errors: ['G0004', 'G0010', 'G0054', 'G0030'],
        refs: ['schedule'],
        traps: [
            { text: '同一 rule 内同一 Reg 只写一次', severity: 'hard' },
            { text: 'urgency 属性避免循环', severity: 'hard' },
        ],
    },
    method: {
        errors: ['P0032', 'P0030', 'T0011'],
        refs: ['module'],
        traps: [
            { text: 'method 必须在所有 rule 之后', severity: 'hard' },
            { text: 'value method 用 = 而非 if-return', severity: 'hard' },
        ],
    },
    types: {
        errors: ['T0061', 'T0051', 'T0060', 'T0132'],
        refs: ['types'],
        traps: [
            { text: 'Bool 用 ! 不用 ~', severity: 'hard' },
            { text: 'Bit#(n) 位宽一致性', severity: 'hard' },
            { text: 'sized literal 不超位宽', severity: 'hard' },
        ],
    },
    vector: {
        errors: ['T0004'],
        refs: ['stdlib', 'types'],
        traps: [
            { text: 'vec() 在 BSC 2025.07 不可用 — 构造 Vector 用 genWith(fromInteger)', severity: 'hard' },
            { text: 'Vector 索引/遍历 用 findIndex/map/fold 等标准库函数，索引用 UInt 而非 Integer', severity: 'quality' },
        ],
    },
    schedule: {
        errors: ['G0004', 'G0010', 'G0030', 'G0040', 'G0054'],
        refs: ['schedule'],
        traps: [
            { text: 'descending_urgency 不循环', severity: 'hard' },
            { text: 'execution_order 用于 SE 而非 SB', severity: 'quality' },
        ],
    },
    regfile: {
        errors: ['G0002'],
        refs: ['stdlib'],
        pattern: 'regfile',
        traps: [
            { text: 'RegFile 最多 5 读端口 — 超出触发 G0002', severity: 'hard' },
            { text: 'mkRegFileFull vs mkRegFile 选型', severity: 'quality' },
            { text: '同 cycle 读写同地址 → G0004', severity: 'hard' },
        ],
    },
    arbiter: {
        errors: ['G0002', 'G0004'],
        refs: ['stdlib', 'patterns'],
        pattern: 'arbiter',
        traps: [
            { text: '同一 cycle 超 5 读端口 → G0002', severity: 'hard' },
            { text: 'winner 丢失 → 需缓冲 FIFO', severity: 'quality' },
        ],
    },
    serialize: {
        errors: ['T0051', 'T0060'],
        refs: ['types'],
        pattern: 'serialize',
        traps: [
            { text: 'shift reg 位宽对齐', severity: 'hard' },
            { text: 'cnt = log2(data_width) 位宽计算', severity: 'quality' },
        ],
    },
    interrupt: {
        errors: ['T0060', 'T0061'],
        refs: ['types', 'patterns'],
        pattern: 'interrupt',
        traps: [
            { text: 'IRQ 信号用 Bit#(n) 便于多中断检测', severity: 'quality' },
            { text: 'mask 位宽 vs pending 位宽对齐', severity: 'hard' },
        ],
    },
    dma: {
        errors: ['G0010', 'G0004'],
        refs: ['patterns', 'schedule', 'stdlib'],
        traps: [
            { text: 'DMA 描述符链用 FIFO 传递 — 不用 Wire', severity: 'quality' },
            { text: 'burst 传输注意地址对齐', severity: 'quality' },
            { text: 'DMA done 信号用 Bool 而非 Bit#(1)', severity: 'style' },
        ],
    },
    encoder: {
        errors: ['T0060', 'T0051'],
        refs: ['types', 'stdlib'],
        pattern: 'encoder',
        traps: [
            { text: '编码器输出位宽 = ceil(log2(input_width))', severity: 'quality' },
            { text: '优先编码器用 findIndex 查 Vector 中第一个满足条件的位（不用 foldl 手工遍历）', severity: 'quality' },
            { text: '输出 valid 信号用 Bit#(1) 不用 Bool', severity: 'quality' },
            { text: '索引用 UInt#(n) 不用 Integer', severity: 'quality' },
        ],
    },
    decoder: {
        errors: ['T0060', 'T0051'],
        refs: ['types', 'patterns'],
        traps: [
            { text: '译码输出位宽 = 2^input_width', severity: 'quality' },
            { text: 'one-hot 输出注意位宽膨胀', severity: 'quality' },
            { text: '组合逻辑 decoder 用 function 而非 rule', severity: 'quality' },
        ],
    },
    timer: {
        errors: ['T0060', 'T0051', 'G0004'],
        refs: ['stdlib', 'types'],
        traps: [
            { text: '计数器位宽 = ceil(log2(max_count))', severity: 'quality' },
            { text: '预分频器用 Bit#(n) 分频', severity: 'quality' },
            { text: 'timer done 用 Bool 避免位拼接冲突', severity: 'style' },
        ],
    },
    gpio: {
        errors: ['T0061', 'BSV-PORTS'],
        refs: ['module', 'types'],
        traps: [
            { text: 'GPIO 方向寄存器用 Bool 还是 Bit#(1) — 建议 Bit#(1) 可拼总线', severity: 'quality' },
            { text: 'inout 信号用 Inout#(Bit#(1)) 包装', severity: 'hard' },
            { text: '输出端口在顶层模块直接接 method', severity: 'quality' },
        ],
    },
    synthesize: {
        errors: ['T0030', 'P0085'],
        refs: ['module', 'attributes'],
        traps: [
            { text: '多态模块不能直接 synthesize — 用具体类型包裹', severity: 'hard' },
            { text: '顶层模块加 (* synthesize *)', severity: 'hard' },
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

export { KEYWORDS };
