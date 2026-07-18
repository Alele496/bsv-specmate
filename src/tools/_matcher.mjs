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
// alwaysShow: boolean — 即使 verified:false 也强制显示（仅用于 P0030/P0005 等核心安全规则）
//
// verified for traps (QA pillar — validation status):
//   false — 尚未经过编译验证
//   true  — 已通过 fixture 编译验证，需附带 verifiedAt 字段

// Unified trap knowledge base — merged from UNIVERSAL_TRAPS + KNOWLEDGE_TRAPS + COMMON_WARNINGS.
// Tier A (pushTier 'always'): pushed unconditionally.
// Tier B (pushTier 'matched'): pushed when keywords match the task description, top 5.
// All traps are stage-aware: filtered by inferPhase() result.
const TRAPS = [
    // ═══ Tier A: always push — base-level traps for all BSV tasks ═══
    {
        id: 'trap-p0030',
        name: 'P0030 — Value method 中非尾位置 return',
        oneLiner: 'BSV value method 只能用 = expr 形式，if/for 块内的 return 会触发 P0030',
        why: 'BSV value method 使用 = 表达式语法，编译器译为纯组合逻辑。在 if/for 块中用 return 会强制引入 Action 上下文（需要状态变化），导致类型不匹配。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'always',
        keywords: ['value method', 'return', 'if', 'for', 'while', 'case', 'P0030', 'method', 'action'],
        wrongCode: `method Bit#(1) tx;
    if (!tx_busy) return 1'd1;
    return 1'd0;
endmethod`,
        correctCode: `method Bit#(1) tx = (!tx_busy) ? 1'd1 : 1'd0;`,
        docRef: 'docs/traps/trap-p0030.md',
        related: ['trap-p0005', 'trap-p0022', 'trap-bool-vs-bit'],
        source: 'UNIVERSAL_TRAPS + KNOWLEDGE_TRAPS',
        bscVersions: ['2025.07'],
        verified: true,
        verifiedAt: '2026-07-17',
        alwaysShow: true,
    },
    {
        id: 'trap-p0005',
        name: 'P0005 — function 是 Verilog-2001 保留字',
        oneLiner: '模块内 genWith/map/fold 的回调不可写 function 关键字，用部分应用替代',
        why: 'BSV 模块内的 function 关键字与 Verilog-2001 保留字冲突。genWith/map 回调不能写 function(Integer i)...endfunction。BSC 生成的 Verilog 中出现 function 关键字导致 V2K 冲突。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'always',
        keywords: ['function', 'genWith', 'map', 'fold', 'findIndex', 'P0005', '保留字', 'reserved', 'lambda'],
        wrongCode: `Vector#(8, Bit#(3)) result = genWith(function(Integer i);
    return requests[i];
endfunction);`,
        correctCode: `Vector#(8, Bit#(3)) result = genWith(requests, \\== (1));`,
        docRef: 'docs/traps/trap-p0005.md',
        related: ['trap-p0030', 'trap-p0022', 'trap-vec-construction'],
        source: 'UNIVERSAL_TRAPS + KNOWLEDGE_TRAPS',
        bscVersions: ['2025.07'],
        verified: true,
        verifiedAt: '2026-07-17',
        alwaysShow: true,
    },
    {
        id: 'trap-bool-vs-bit',
        name: 'Bool 与 Bit#(1) 选型 — interface 兼容性',
        oneLiner: 'bsc 2025.07 类型检查已加强（! 对 Bit#(1) 报 T0020），但选错类型仍导致 interface 集成问题',
        why: 'bsc 2025.07 的类型检查器已能捕获大部分 Bool/Bit#(1) 操作符混用（! 对 Bit#(1)、~ 对 Bool 均报 T0020）。但仍需注意：内部信号用 Bool 会导致 interface method 被迫用 Bool，进而无法位拼接进 status bus。建议硬件信号一律用 Bit#(1)，仅纯逻辑判断（如 if 条件中的中间变量）用 Bool。',
        severity: 'quality',
        bscDetectable: true,
        stage: 'both',
        pushTier: 'always',
        keywords: ['Bool', 'bool', 'Bit#(1)', 'bit', '操作符', 'operator', '!', '&&', '||', '~', '&', '|', 'not', 'and', 'or'],
        wrongCode: `Bool valid = True;
// 内部用 Bool → interface method 被迫返回 Bool
// method Bool is_valid() = valid;  // 下游无法拼接进 status bus`,
        correctCode: `Bit#(1) valid = 1'd1;
// interface method 用 Bit#(1)，可直接参与位拼接
method Bit#(1) is_valid();
    return valid;
endmethod`,
        docRef: 'docs/traps/trap-bool-vs-bit.md',
        related: ['trap-interface-bool'],
        source: 'KNOWLEDGE_TRAPS + COMMON_WARNINGS',
        bscVersions: ['2025.07'],
        verified: true,
        verifiedAt: '2026-07-17',
    },
    {
        id: 'trap-g0004',
        name: 'G0004 — 单 rule 内同一子模块的多个 Action method 调用',
        oneLiner: '同一 rule 内调用同一子模块的多个 Action method（都写同一寄存器）→ G0004 并行冲突，拆 rule',
        why: 'BSC 调度分析器在 rule 粒度上判断 method 冲突。同一子模块的两个 Action method（如 inc/dec）都写同一个内部寄存器时，BSC 判定为并行调用冲突并报 G0004。解决方法是拆成多条 rule，每条只调用一个 Action method。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'both',
        pushTier: 'always',
        keywords: ['rule', '子模块', 'submodule', 'G0004', '冲突', 'conflict', 'parallel', '并行', '拆', 'split', '调度', 'schedule', 'Action', 'method'],
        wrongCode: `// 同一子模块 ctr 的 inc() 和 dec() 都写 count 寄存器
rule do_work;
    ctr.inc();  // 写 count <= count + 1
    ctr.dec();  // 也写 count <= count - 1 → G0004
endrule`,
        correctCode: `rule do_inc;
    ctr.inc();
endrule
rule do_dec;
    ctr.dec();
endrule`,
        docRef: 'docs/traps/trap-g0004.md',
        related: ['trap-g0053', 'trap-always-ready-guard'],
        source: 'KNOWLEDGE_TRAPS',
        bscVersions: ['2025.07'],
        verified: true,
        verifiedAt: '2026-07-17',
        alwaysShow: true,
    },
    // ═══ Tier B: keyword-matched traps ═══
    {
        id: 'trap-g0053',
        name: 'G0053 — mkReg 用动态表达式（非编译期常量）初始化',
        oneLiner: 'mkReg(wire_value) 中 wire_value 是动态信号非编译期常量，用 mkRegU + rule 显式写入初始值',
        why: 'mkReg(initial_value) 要求 initial_value 是编译期静态常量。Wire、module 参数等动态信号在硬件综合时才能确定，BSC 无法确定寄存器初始值。常见于模块内部用 Wire 信号初始化寄存器。注意：bsc 2025.07 中 module parameter 作 mkReg 参数已不触发 G0053（参数映射为 Verilog parameter），但 Wire 等真正动态信号仍会触发。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['mkReg', 'Wire', 'mkWire', '动态', 'initial', '初始值', 'G0053', '初始化', 'constant', '编译期', 'static'],
        wrongCode: `Wire#(Bit#(1)) w <- mkWire;
Reg#(Bit#(1)) r <- mkReg(w);   // G0053: w 是动态信号`,
        correctCode: `Wire#(Bit#(1)) w <- mkWire;
Reg#(Bit#(1)) r <- mkRegU;     // 无初始值
rule init (!init_done);
    r <= w;                     // 第一个 cycle 写入
    init_done <= True;
endrule`,
        docRef: 'docs/traps/trap-g0053.md',
        related: ['trap-g0004'],
        source: 'KNOWLEDGE_TRAPS',
        bscVersions: ['2025.07'],
        verified: true,
        verifiedAt: '2026-07-17',
    },
    {
        id: 'trap-interface-bool',
        name: 'Interface method 返回/参数用 Bool',
        oneLiner: 'interface method 用 Bool 编译通过但无法拼入 status bus、无法从 Bus 提取，形成集成瓶颈',
        why: 'BSV 类型系统允许 interface method 使用 Bool，单独编译没问题。但下游模块需要位拼接或从 Bus 提取时，Bool 无法参与硬件位操作（T0061: Bool 不能位拼接）。所有标准库 interface 均使用 Bit#(1)。',
        severity: 'quality',
        bscDetectable: false,
        stage: 'design',
        pushTier: 'matched',
        keywords: ['interface', 'method', 'Bool', 'bool', '返回', 'return', '参数', 'argument', '集成', 'integrate', 'status', 'bus', '拼接'],
        wrongCode: `interface MyIP;
    method Bool tx_done();
    method Bool rx_valid();
endinterface`,
        correctCode: `interface MyIP;
    method Bit#(1) tx_done();
    method Bit#(1) rx_valid();
endinterface`,
        docRef: 'docs/traps/trap-interface-bool.md',
        related: ['trap-bool-vs-bit'],
        source: 'KNOWLEDGE_TRAPS',
        bscVersions: ['2025.07'],
        verified: true,
        verifiedAt: '2026-07-17',
    },
    {
        id: 'trap-always-ready-guard',
        name: 'always_ready 声明与隐式条件矛盾',
        oneLiner: 'interface 声明 (* always_ready *) 但实现调用有条件子模块方法 → bsc 不报错，调度器误判',
        why: '`(* always_ready *)` 在 interface 声明中告诉调度器该 method 无条件可用。但模块实现中调用子模块方法（如 fifo.first()）会传播隐式条件（notEmpty），导致实际可用性与 interface 声明矛盾。bsc 2025.07 不检查 interface 属性与实现的一致性。注意：`always_ready` 只能在 interface 中用 pragma 形式，模块 method 实现处用 pragma 会触发 P0022。',
        severity: 'quality',
        bscDetectable: false,
        stage: 'both',
        pushTier: 'matched',
        keywords: ['always_ready', 'always_enabled', 'guard', '条件', 'condition', '矛盾', '属性', 'attribute', '接口', 'interface', '隐式条件', 'implicit condition'],
        wrongCode: `// Interface 声明 always_ready
interface ValIFC;
    (* always_ready *) method Bit#(8) val();
endinterface
// 实现调用 fifo.first() ——隐式 notEmpty 条件
module mkVal(ValIFC);
    FIFO#(Bit#(8)) fifo <- mkFIFO;
    method Bit#(8) val();
        return fifo.first();  // 隐式条件，bsc 不报错
    endmethod
endmodule`,
        correctCode: `// 方案1: 去掉 always_ready，显式传隐式条件
interface ValIFC;
    method Bit#(8) val();  // 调度器正确识别隐式条件
endinterface
// 方案2: 确保实现无隐式条件（纯组合逻辑）
// method Bit#(8) val();
//     return (state == TX) ? data : 0;  // 无条件组合逻辑
// endmethod`,
        docRef: 'docs/traps/trap-always-ready-guard.md',
        related: ['trap-g0004', 'trap-p0022'],
        source: 'KNOWLEDGE_TRAPS + COMMON_WARNINGS',
        bscVersions: ['2025.07'],
        verified: true,
        verifiedAt: '2026-07-17',
    },
    {
        id: 'trap-p0022',
        name: 'P0022 — Module method 实现用 pragma 而非 suffix',
        oneLiner: 'module 内 method 实现不能用 (* attribute *) pragma，必须用 suffix 关键字形式',
        why: 'BSV method 属性有两种语法：pragma 形式 (* attribute *) 用于 interface 声明，suffix 关键字形式用于 module 内 method 实现。在 module 实现处使用 pragma 会导致 parser 将属性附着到错误位置，触发 P0022。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['P0022', 'pragma', 'always_enabled', 'always_ready', 'attribute', 'suffix', '(*', '*)', 'method definition'],
        wrongCode: `(* always_enabled *) method Action send(Bit#(8) data);
    tx_reg <= data;
endmethod`,
        correctCode: `method Action send(Bit#(8) data) always_enabled;
    tx_reg <= data;
endmethod`,
        docRef: 'docs/traps/trap-p0022.md',
        related: ['trap-p0005', 'trap-p0030', 'trap-always-ready-guard'],
        source: 'KNOWLEDGE_TRAPS',
        bscVersions: ['2025.07'],
        verified: true,
        verifiedAt: '2026-07-17',
    },
    {
        id: 'trap-vec-construction',
        name: 'T0004 — vec() 已移除，用 genWith 或 replicateM 构造 Vector',
        oneLiner: 'BSC 2025.07 标准库不导出 vec() 函数，用 replicateM(mkReg(0)) 或 genWith 构造 Vector',
        why: '旧版 BSC 标准库曾导出 vec() 函数用于构造 Vector，BSC 2025.07 已移除。Agent 训练数据可能包含大量旧版代码示例，直接使用 vec() 触发 T0004。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['vec', 'Vector', 'genWith', 'replicateM', 'T0004', '构造', 'construct', 'array', '寄存器数组', 'reg array'],
        wrongCode: `Vector#(4, Reg#(Bit#(32))) regs <- vec(
    mkReg(0), mkReg(0), mkReg(0), mkReg(0)
);`,
        correctCode: `Vector#(4, Reg#(Bit#(32))) regs <- replicateM(mkReg(0));`,
        docRef: 'docs/traps/trap-vec-construction.md',
        related: ['trap-p0005'],
        source: 'KNOWLEDGE_TRAPS + COMMON_WARNINGS',
        bscVersions: ['2025.07'],
        verified: true,
        verifiedAt: '2026-07-17',
    },
    {
        id: 'trap-pulsewire-reg',
        name: 'PulseWire + Reg 跨 rule 传数据丢首字节',
        oneLiner: 'PulseWire 仅存活一个 cycle，搭配 Reg 导致首个数据丢失。跨 rule 传输用 FIFO',
        why: 'PulseWire 写入后下一 cycle 自动清零。搭配 Reg 使用时：cycle N PulseWire 有值，但 Reg 在 cycle N+1 才锁存——此时 PulseWire 已清零。PulseWire 的设计用途是事件通知，不是数据传输。',
        severity: 'quality',
        bscDetectable: false,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['PulseWire', 'pulse', 'wire', 'reg', 'cross', '跨', '传输', 'transfer', 'FIFO', '首字节', '丢失'],
        wrongCode: `PulseWire#(Bit#(8)) data_pw <- mkPulseWire;
Reg#(Bit#(8)) data_reg <- mkRegU;
rule receive; data_pw.send(byte); endrule
rule process; data_reg <= data_pw; endrule`,
        correctCode: `FIFO#(Bit#(8)) data_fifo <- mkFIFO;
rule receive; data_fifo.enq(byte); endrule
rule process; let byte = data_fifo.first(); data_fifo.deq(); endrule`,
        docRef: 'docs/traps/trap-pulsewire-reg.md',
        related: ['trap-g0004'],
        source: 'KNOWLEDGE_TRAPS + COMMON_WARNINGS',
        bscVersions: ['2025.07'],
        verified: true,
        verifiedAt: '2026-07-17',
    },
    // ═══ Tier B: new — upgraded from COMMON_WARNINGS ═══
    {
        id: 'trap-g0036-urgency',
        name: 'G0036 — 多 rule 写同一寄存器，BSC 推断 urgency',
        oneLiner: '多个 rule 写同一寄存器时 BSC 推断执行顺序并发 G0036 警告，用 descending_urgency 显式标注',
        why: '多个 rule 通过 _write 方法写同一寄存器时，BSC 无法确定执行顺序，会推断一个默认的 urgency 关系并发 G0036 警告（通常伴随 G0117 action shadowing 警告）。不加 descending_urgency 注释，BSC 的选择可能是错误的。bsc 2025.07 中此场景生成 G0036+G0117（非 G0010），但语义等价。',
        severity: 'quality',
        bscDetectable: true,
        stage: 'both',
        pushTier: 'matched',
        keywords: ['descending_urgency', 'G0036', 'G0010', 'G0117', '调度', 'schedule', 'urgency', 'conflict', 'rule', 'shadow', '阴影'],
        wrongCode: `// 两个 rule 都写 count 寄存器 → G0036 + G0117
rule rl_a;
    count <= 1;
endrule
rule rl_b;
    count <= 2;
endrule`,
        correctCode: `(* descending_urgency = "rl_b, rl_a" *)
// rl_b 优先级高于 rl_a，显式消除 G0036
rule rl_a;
    count <= 1;
endrule
rule rl_b;
    count <= 2;
endrule`,
        docRef: 'docs/errors/G0010.md',
        related: ['trap-g0004'],
        source: 'UPDATED — was G0010, replaced by G0036 in bsc 2025.07',
        bscVersions: ['2025.07'],
        verified: true,
        verifiedAt: '2026-07-17',
    },
    {
        id: 'trap-cdc-crossing',
        name: '跨时钟域数据必须用 mkSyncFIFO / mkSyncBit05',
        oneLiner: '直接用普通寄存器跨时钟域会在综合时产生不确定行为，用 mkSyncFIFO 或 mkSyncBit05',
        why: '跨时钟域数据传递不能用普通寄存器——CDC 需要专门的同步器处理亚稳态。BSV 提供 mkSyncFIFO（数据流）和 mkSyncBit05（控制信号）两个同步原语。',
        severity: 'quality',
        bscDetectable: false,
        stage: 'design',
        pushTier: 'matched',
        keywords: ['clock', 'domain', 'crossing', 'cdc', '跨时钟', 'sync', 'mkSync', '亚稳态', 'metastability'],
        wrongCode: `// 两个不同时钟域的模块直接用 Wire 连线
// 综合工具会产生不确定行为，仿真可能通过但硬件失败`,
        correctCode: `SyncFIFOIfc#(Bit#(32)) sync <- mkSyncFIFO(2, sclk, srst, dclk);
// 或控制信号: SyncBitIfc#(Bit#(1)) sync_bit <- mkSyncBit05(sclk, srst, dclk);`,
        docRef: 'docs/reference/stdlib.md',
        related: ['trap-g0036-urgency'],
        source: 'NEW — from COMMON_WARNINGS',
        bscVersions: ['2025.07'],
        verified: true,
        verifiedAt: '2026-07-17',
    },
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
        traps: [
            { text: 'BRAMCore: 读/写端口分离, BRAM: 单端口 — 选对类型', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
            { text: 'BRAM 数据位宽 vs 外部总线位宽对齐', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    fsm: {
        errors: ['G0004_FSM', 'P0030', 'G0010'],
        refs: ['patterns', 'module'],
        style: 'safe',
        pattern: 'fsm',
        traps: [
            { text: 'StmtFSM 隐式并行写 — 避免同一 cycle 写同一 Reg', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-14' },
            { text: 'value method 不用 if-return，用 ?: 三元链', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
        ],
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
        traps: [
            { text: 'SPI 命令字 Bit#(8), 移位寄存器匹配', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
            { text: 'CS/SCK/MOSI/MISO 信号命名统一', severity: 'style', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    crc: {
        errors: ['T0060', 'T0061'],
        refs: ['types'],
        pattern: 'crc',
        traps: [
            { text: 'CRC 多项式位宽确认', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'Bool vs Bit#(1) 区分 — done/error 等硬件控制信号用 Bit#(1)，便于位拼接和 interface 集成', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
        ],
    },
    uart: {
        errors: ['T0051', 'T0060'],
        refs: ['stdlib'],
        pattern: 'uart',
        traps: [
            { text: '波特率分频用 Bit#(n) 而非 Integer', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
            { text: 'UART 帧格式 start + 8bit + stop', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
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
        traps: [
            { text: 'descending_urgency 不循环', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
            { text: 'execution_order 用于 SE 而非 SB', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
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
        traps: [
            { text: '同一 cycle 超 5 读端口 → G0002', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
            { text: 'winner 丢失 → 需缓冲 FIFO', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
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
        traps: [
            { text: 'IRQ 信号用 Bit#(n) 便于多中断检测', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'mask 位宽 vs pending 位宽对齐', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
        ],
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
        traps: [
            { text: 'GPIO 方向寄存器用 Bool 还是 Bit#(1) — 建议 Bit#(1) 可拼总线', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: 'GPIO inout 信号通过 BVI 机制处理：BSV interface 中定义独立的 data_in、data_out、oe（output enable）method，Verilog wrapper 中用 assign io = oe ? data_out : \'bz 实现三态控制。Inout#() 包装器属于旧版 BSC 库用法，BSC 2025.07 中不推荐直接使用', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
            { text: '输出端口在顶层模块直接接 method', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
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

export { KEYWORDS, TRAPS, GRAPH };
