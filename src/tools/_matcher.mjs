const GRAPH = {
    fifo: {
        errors: ['G0010', 'G0004'],
        refs: ['stdlib', 'schedule'],
        style: 'engineering',
        pattern: 'fifo',
        traps: ['mkFIFO vs mkBypassFIFO — BypassFIFO 允许同周期 enq/deq 但会触发 G0010'],
    },
    pipeline: {
        errors: ['G0004', 'G0010'],
        refs: ['patterns', 'schedule'],
        style: 'engineering',
        pattern: 'pipeline',
        traps: ['级联模块间用 FIFO 传递 data，不要用 Wire + handshake'],
    },
    clock: {
        errors: ['BSV-PORTS'],
        refs: ['module', 'attributes'],
        pattern: 'clock_cross',
        traps: ['Clock 类型需要 import Clocks::*', '跨时钟域用 mkSyncFIFO / mkSyncBRAMFIFO'],
    },
    reset: {
        errors: [],
        refs: ['module'],
        traps: ['Reset 类型需要显式 import', 'default_reset 在 BVI 中是 RST_N 而非 RST'],
    },
    axi: {
        errors: ['BSV-PORTS', 'G0010'],
        refs: ['module', 'attributes', 'patterns'],
        style: 'engineering',
        pattern: 'axi_stream',
        traps: ['AXI4 接口 port 名与 BSV method 名不一致 — 用 Verilog wrapper'],
    },
    bram: {
        errors: ['G0004', 'T0060'],
        refs: ['stdlib'],
        pattern: 'bram',
        traps: ['BRAMCore: 读/写端口分离, BRAM: 单端口 — 选对类型', 'BRAM 数据位宽 vs 外部总线位宽对齐'],
    },
    fsm: {
        errors: ['G0004_FSM', 'P0030', 'G0010'],
        refs: ['patterns', 'module'],
        style: 'safe',
        pattern: 'fsm',
        traps: ['StmtFSM 隐式并行写 — 避免同一 cycle 写同一 Reg', 'value method 不用 if-return，用 ?: 三元链'],
    },
    bvi: {
        errors: ['P0005', 'G0124'],
        refs: ['attributes'],
        pattern: 'bvi',
        traps: ['default_clock / default_reset 必须写', 'parameter width = valueOf(sz_a) — 位宽参数模板'],
    },
    spi: {
        errors: ['T0051', 'T0060'],
        refs: ['stdlib'],
        pattern: 'spi',
        traps: ['SPI 命令字 Bit#(8), 移位寄存器匹配', 'CS/SCK/MOSI/MISO 信号命名统一'],
    },
    crc: {
        errors: ['T0060', 'T0061'],
        refs: ['types'],
        pattern: 'crc',
        traps: ['CRC 多项式位宽确认', 'Bool vs Bit#(1) 区分 — \'done\' 信号用 Bool'],
    },
    uart: {
        errors: ['T0051', 'T0060'],
        refs: ['stdlib'],
        pattern: 'uart',
        traps: ['波特率分频用 Bit#(n) 而非 Integer', 'UART 帧格式 start + 8bit + stop'],
    },
    struct: {
        errors: ['T0016', 'P0073'],
        refs: ['structs', 'types'],
        traps: ['struct 字段名拼写', 'struct 字面量用 MyStruct { field: val } 格式'],
    },
    union: {
        errors: ['T0144', 'T0016'],
        refs: ['unions', 'types'],
        traps: ['tagged 构造带数据的 tag 必须传参', 'union 字段不能 .field 直接访问 — 用 case matches'],
    },
    attribute: {
        errors: ['P0085', 'G0054', 'G0030', 'G0040'],
        refs: ['attributes'],
        traps: ['synthesize 不拼写成 synthesized', 'urgency 规则名必须在本模块中存在'],
    },
    interface: {
        errors: ['P0073', 'G0010'],
        refs: ['module', 'patterns'],
        traps: ['接口方法名不能重复', 'interface instance 用 <- 而非 ='],
    },
    rule: {
        errors: ['G0004', 'G0010', 'G0054', 'G0030'],
        refs: ['schedule'],
        traps: ['同一 rule 内同一 Reg 只写一次', 'urgency 属性避免循环'],
    },
    method: {
        errors: ['P0032', 'P0030', 'T0011'],
        refs: ['module'],
        traps: ['method 必须在所有 rule 之后', 'value method 用 = 而非 if-return'],
    },
    types: {
        errors: ['T0061', 'T0051', 'T0060', 'T0132'],
        refs: ['types'],
        traps: ['Bool 用 ! 不用 ~', 'Bit#(n) 位宽一致性', 'sized literal 不超位宽'],
    },
    vector: {
        errors: ['T0004'],
        refs: ['stdlib', 'types'],
        traps: ['vec() 在 BSC 2025.07 不可用 — 用 genWith(fromInteger)', 'Vector 索引用 UInt 而非 Integer'],
    },
    regfile: {
        errors: ['G0002'],
        refs: ['stdlib'],
        traps: ['RegFile 最多 5 读端口 — 超出触发 G0002', 'mkRegFileFull vs mkRegFile 选型'],
    },
    schedule: {
        errors: ['G0004', 'G0010', 'G0030', 'G0040', 'G0054'],
        refs: ['schedule'],
        traps: ['descending_urgency 不循环', 'execution_order 用于 SE 而非 SB'],
    },
    regfile: {
        errors: ['G0002'],
        refs: ['stdlib'],
        pattern: 'regfile',
        traps: ['RegFile 最多 5 读端口 — 超出触发 G0002', 'mkRegFileFull vs mkRegFile 选型', '同 cycle 读写同地址 → G0004'],
    },
    arbiter: {
        errors: ['G0002', 'G0004'],
        refs: ['stdlib', 'patterns'],
        pattern: 'arbiter',
        traps: ['同一 cycle 超 5 读端口 → G0002', 'winner 丢失 → 需缓冲 FIFO'],
    },
    serialize: {
        errors: ['T0051', 'T0060'],
        refs: ['types'],
        pattern: 'serialize',
        traps: ['shift reg 位宽对齐', 'cnt = log2(data_width) 位宽计算'],
    },
    interrupt: {
        errors: ['T0060', 'T0061'],
        refs: ['types', 'patterns'],
        pattern: 'interrupt',
        traps: ['IRQ 信号用 Bit#(n) 便于多中断检测', 'mask 位宽 vs pending 位宽对齐'],
    },
    dma: {
        errors: ['G0010', 'G0004'],
        refs: ['patterns', 'schedule', 'stdlib'],
        traps: ['DMA 描述符链用 FIFO 传递 — 不用 Wire', 'burst 传输注意地址对齐', 'DMA done 信号用 Bool 而非 Bit#(1)'],
    },
    encoder: {
        errors: ['T0060', 'T0051'],
        refs: ['types'],
        traps: ['编码器输出位宽 = ceil(log2(input_width))', '优先编码器用 for 循环 + return', 'case 穷举而非 default 逻辑'],
    },
    decoder: {
        errors: ['T0060', 'T0051'],
        refs: ['types', 'patterns'],
        traps: ['译码输出位宽 = 2^input_width', 'one-hot 输出注意位宽膨胀', '组合逻辑 decoder 用 function 而非 rule'],
    },
    timer: {
        errors: ['T0060', 'T0051', 'G0004'],
        refs: ['stdlib', 'types'],
        traps: ['计数器位宽 = ceil(log2(max_count))', '预分频器用 Bit#(n) 分频', 'timer done 用 Bool 避免位拼接冲突'],
    },
    gpio: {
        errors: ['T0061', 'BSV-PORTS'],
        refs: ['module', 'types'],
        traps: ['GPIO 方向寄存器用 Bool 还是 Bit#(1) — 建议 Bit#(1) 可拼总线', 'inout 信号用 Inout#(Bit#(1)) 包装', '输出端口在顶层模块直接接 method'],
    },
    synthesize: {
        errors: ['T0030', 'P0085'],
        refs: ['module', 'attributes'],
        traps: ['多态模块不能直接 synthesize — 用具体类型包裹', '顶层模块加 (* synthesize *)'],
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

export function match(keywords) {
    const merged = { errors: new Set(), refs: new Set(), styles: new Set(), traps: [], patterns: [] };
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
        traps: [...new Set(merged.traps)],
        patterns: [...new Set(merged.patterns)],
    };
}

export { KEYWORDS };
