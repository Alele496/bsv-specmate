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
    // ═══ Batch 1: 6 空 GRAPH 节点回填 (2026-07-20) ═══
    {
        id: 'reset-1',
        name: 'T0051 — Reset 类型需要显式 import Reset :: *',
        oneLiner: '模块中写 `Reset rst` 但未导入 Reset package，触发 T0051 未定义类型错误',
        why: 'BSV 中 `Reset` 类型定义在 `Reset` package 中。在 module 接口中使用 `Reset` 类型但不导入 `Reset :: *`，编译器无法识别该类型，触发 T0051 未定义类型错误。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['Reset', 'reset', 'import', 'T0051', '未定义', 'undefined', 'type'],
        wrongCode: `// 缺少 import Reset :: *
module mkMod(Empty);
    Reset rst <- exposeCurrentReset;  // T0051: Reset 类型未定义
endmodule`,
        correctCode: `import Reset :: *;

module mkMod(Empty);
    Reset rst <- exposeCurrentReset;
endmodule`,
        docRef: 'docs/traps/trap-reset-1.md',
        related: ['reset-2'],
        source: 'NEW — Batch 1 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'reset-2',
        name: 'G0124 — default_reset 期望 RST_N 端口名',
        oneLiner: 'BVI import 时 `default_reset` 期望 Verilog port 名为 `RST_N`，RTL 中叫 `RST` 导致端口绑定失败',
        why: 'BVI import 声明 `default_reset` 时，BSC 期望对应的 Verilog port 名为 `RST_N`（低电平有效复位）。如果 RTL 中复位信号名为 `RST`（高电平有效），BSC 无法正确绑定端口，触发 G0124。需要显式指定端口名 `default_reset rst(RST)`。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['default_reset', 'RST_N', 'RST', 'BVI', 'G0124', '复位', 'reset', 'port', '绑定', 'bind'],
        wrongCode: `import "BVI" MyModule =
module mkMyModule(MyIFC);
    default_clock clk(CLK);
    default_reset rst;  // 期望 Verilog port RST_N，但 RTL 中是 RST
    method out ready() RDY;
endmodule`,
        correctCode: `import "BVI" MyModule =
module mkMyModule(MyIFC);
    default_clock clk(CLK);
    default_reset rst(RST);  // 显式指定端口名为 RST
    method out ready() RDY;
endmodule`,
        docRef: 'docs/traps/trap-reset-2.md',
        related: ['reset-1', 'bvi-1'],
        source: 'NEW — Batch 1 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'bvi-1',
        name: 'G0124 — BVI 缺少 default_clock / default_reset',
        oneLiner: 'BVI import 声明中缺少 `default_clock` 或 `default_reset` 导致 bsc 无法确定时钟/复位端口映射，触发 G0124',
        why: 'BVI (Bluespec Verilog Interface) import 用于封装 Verilog 模块。`default_clock` 和 `default_reset` 声明告诉 BSC 将哪个 Verilog port 映射到 BSV 的隐式时钟/复位。缺少这两项时 BSC 无法生成正确的实例化代码，触发 G0124。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['BVI', 'bvi', 'default_clock', 'default_reset', 'G0124', 'import', 'Verilog', 'wrapper', '封装'],
        wrongCode: `import "BVI" MyVerilog =
module mkMyVerilog(MyIFC);
    // 缺少 default_clock 和 default_reset → G0124
    method out ready() RDY;
endmodule`,
        correctCode: `import "BVI" MyVerilog =
module mkMyVerilog(MyIFC);
    default_clock clk(CLK);
    default_reset rst(RST_N);
    method out ready() RDY;
endmodule`,
        docRef: 'docs/traps/trap-bvi-1.md',
        related: ['bvi-2', 'reset-2'],
        source: 'NEW — Batch 1 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'bvi-2',
        name: 'T0016 — BVI parameter 必须用 valueOf() 包装类型变量',
        oneLiner: 'BVI interface parameter 中 type variable 必须通过 `valueOf()` 转为 Verilog parameter，直接写 `sz_a` 触发 T0016',
        why: 'BVI import 中 interface parameter 的类型变量（如 `sz_a`）是 BSV 类型层面的概念，不能直接映射为 Verilog parameter。必须用 `valueOf(sz_a)` 将其转换为可映射的数值表达式。直接写 `parameter width = sz_a` 触发 T0016 类型推导失败。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['valueOf', 'valueof', 'BVI', 'parameter', 'T0016', 'sz_', '类型变量', 'type variable'],
        wrongCode: `import "BVI" MyModule =
module mkMyModule#(Bit#(sz_a) val) (MyIFC);
    default_clock clk(CLK);
    default_reset rst(RST_N);
    parameter width = sz_a;  // T0016: 不能直接用类型变量
    method out ready() RDY;
endmodule`,
        correctCode: `import "BVI" MyModule =
module mkMyModule#(Bit#(sz_a) val) (MyIFC);
    default_clock clk(CLK);
    default_reset rst(RST_N);
    parameter width = valueOf(sz_a);  // 正确：用 valueOf() 转换
    method out ready() RDY;
endmodule`,
        docRef: 'docs/traps/trap-bvi-2.md',
        related: ['bvi-1', 'trap-p0022'],
        source: 'NEW — Batch 1 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'union-1',
        name: 'T0144 — tagged 构造带数据的 tag 必须传参',
        oneLiner: '`union tagged { Valid Bit#(8) data; Invalid; }` 中构造 `tagged Valid` 缺少 data 参数，触发 T0144',
        why: 'BSV union 有两种 tag：带数据的（如 `Valid Bit#(8) data`）和不带数据的（如 `Invalid`）。构造带数据的 tag 时必须传入对应值：`tagged Valid 8\'h42`。只写 `tagged Valid` 缺少 data 参数触发 T0144。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['union', 'tagged', 'T0144', 'tag', '构造', 'construct', '成员', 'member'],
        wrongCode: `typedef union tagged {
    Bit#(8) Valid;
    void Invalid;
} Result deriving(Bits, Eq);

// ...
Result r = tagged Valid;  // T0144: 缺少 data 参数`,
        correctCode: `typedef union tagged {
    Bit#(8) Valid;
    void Invalid;
} Result deriving(Bits, Eq);

// ...
Result r = tagged Valid 8'h42;  // 正确：传入 data`,
        docRef: 'docs/traps/trap-union-1.md',
        related: [],
        source: 'NEW — Batch 1 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'attribute-1',
        name: 'P0085 — synthesize 不拼写成 synthesized',
        oneLiner: '误写为 `(* synthesized *)`（过去分词）触发 P0085 未识别的 attribute pragma，正确写法是 `(* synthesize *)`',
        why: 'BSV 中 `synthesize` 是关键字形式的 attribute pragma，不是英语单词。过去分词形式 `synthesized` 不是合法的 BSV attribute，编译器将其视为未识别的 pragma 并报告 P0085。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['synthesize', 'synthesized', 'P0085', 'pragma', 'attribute', '拼写', 'spelling'],
        wrongCode: `(* synthesized *)  // P0085: 非法，应为 synthesize
module mkMod(Empty);
endmodule`,
        correctCode: `(* synthesize *)  // 正确拼写
module mkMod(Empty);
endmodule`,
        docRef: 'docs/traps/trap-attribute-1.md',
        related: ['attribute-2'],
        source: 'NEW — Batch 1 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'attribute-2',
        name: 'G0054 — urgency 规则名必须在本模块中存在',
        oneLiner: '写 `(* descending_urgency = "rl_b, rl_a" *)` 但 `rl_a` 拼写错误或不存在，触发 G0054',
        why: '`(* descending_urgency *)` pragma 中引用的 rule 名称必须是本模块中实际定义的 rule。引用不存在或拼写错误的 rule 名称触发 G0054：BSC 无法解析 urgency 关系。注意 rule 名称区分大小写。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['urgency', 'descending_urgency', 'G0054', 'attribute', 'pragma', '拼写', 'spelling', 'rule name'],
        wrongCode: `(* descending_urgency = "rl_b, rl_a" *)
// rl_a 不存在 → G0054
rule rl_b;
    count <= 2;
endrule`,
        correctCode: `(* descending_urgency = "rl_b, rl_a" *)
rule rl_a;
    count <= 1;
endrule
rule rl_b;
    count <= 2;
endrule`,
        docRef: 'docs/traps/trap-attribute-2.md',
        related: ['attribute-1'],
        source: 'NEW — Batch 1 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'rule-1',
        name: 'G0004 — 同一 rule 内同一 Reg 只写一次',
        oneLiner: '一条 rule 内对同一个寄存器执行两次 `<=` 写入，触发 G0004 并行写冲突',
        why: 'BSC 调度分析器在 rule 粒度上检查寄存器写冲突。一条 rule 内对同一个寄存器执行多次 `<=` 写入，BSC 判定为并行写冲突，触发 G0004。每个寄存器在一 cycle 只能有一个确定的写入值。需拆成多条 rule 或用条件表达式合并写入。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['rule', 'G0004', 'reg', '寄存器', '写', 'write', '两次', 'twice', '并行', 'parallel', '冲突', 'conflict'],
        wrongCode: `Reg#(Bit#(8)) count <- mkReg(0);
rule do_work;
    count <= 1;
    count <= 2;  // G0004: 同一 rule 写两次
endrule`,
        correctCode: `Reg#(Bit#(8)) count <- mkReg(0);
rule do_work;
    count <= (cond) ? 1 : 2;  // 正确：单次写入
endrule`,
        docRef: 'docs/traps/trap-rule-1.md',
        related: ['trap-g0004', 'trap-g0036-urgency'],
        source: 'NEW — Batch 1 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'method-1',
        name: 'P0032 — method 必须在所有 rule 之后',
        oneLiner: 'BSV module 中 method 定义块必须在所有 rule 定义之后，在 rule 之间或之前定义 method 触发 P0032',
        why: 'BSV module 有严格的语法结构：子模块实例化 → rule 定义 → method 定义。method 块必须在所有 rule 之后。在 rule 之间或之前定义 method 触发 P0032。此约束源于 BSC 对 module 体内声明顺序的 parser 要求。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['method', 'P0032', 'rule', '顺序', 'order', '定义', 'definition', '位置', 'placement'],
        wrongCode: `module mkMod(TestIFC);
    Reg#(Bit#(8)) r <- mkReg(0);

    method Bit#(8) val() = r;  // P0032: method 在 rule 之前

    rule increment;
        r <= r + 1;
    endrule
endmodule`,
        correctCode: `module mkMod(TestIFC);
    Reg#(Bit#(8)) r <- mkReg(0);

    rule increment;
        r <= r + 1;
    endrule

    method Bit#(8) val() = r;  // 正确：method 在所有 rule 之后
endmodule`,
        docRef: 'docs/traps/trap-method-1.md',
        related: ['method-2', 'trap-p0030'],
        source: 'NEW — Batch 1 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'method-2',
        name: 'P0030 — value method 用 = 而非 if-return',
        oneLiner: 'value method 只能用 `= expression` 形式，用 `=` 后跟 `if/return` 块触发 P0030',
        why: 'BSV value method 使用 `= expression` 语法定义纯组合逻辑。如果用 `method Type name = ...` 后面跟 `if`/`for`/`while` 等控制块和 `return` 语句，BSC parser 将其识别为 action block（需要状态变化），与 value method 的声明冲突，触发 P0030。注意：`= if-return` 在语法上看似合法但语义上不正确，必触发 P0030。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['value method', 'P0030', 'return', 'if', 'for', 'while', '三元', 'ternary', '?'],
        wrongCode: `method Bit#(1) is_done = if (state == DONE) return 1'd1; else return 1'd0;  // P0030`,
        correctCode: `method Bit#(1) is_done = (state == DONE) ? 1'd1 : 1'd0;  // 正确：三元表达式`,
        docRef: 'docs/traps/trap-method-2.md',
        related: ['method-1', 'trap-p0030'],
        source: 'NEW — Batch 1 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    // ═══ Batch 2: 4 GRAPH 节点回填 (2026-07-20) ═══
    {
        id: 'types-1',
        name: 'T0020 — Bool 用 ! 不用 ~，Bit#(n) 用 ~ 不用 !',
        oneLiner: '对 Bool 值用 ~（按位取反）触发 T0020 操作符类型不匹配。! 用于 Bool，~ 用于 Bit#(n)',
        why: 'BSV 类型系统中 ~ 是位级操作符，应用于 Bit#(n)。Bool 只能用逻辑操作符 !、&&、||。对 Bool 用 ~ 或对 Bit#(1) 用 ! 均触发 T0020，因为 BSC 2025.07 的类型检查器已严格区分逻辑类型和位级类型。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['Bool', 'bool', 'Bit#(1)', '!', '~', 'T0020', '操作符', 'operator', 'not', '逻辑非', '按位非', 'bitwise'],
        wrongCode: `Bool done = True;
Bool done_inv = ~done;  // T0020: ~ expects Bit#(n), not Bool`,
        correctCode: `Bool done = True;
Bool done_inv = !done;  // correct: ! for Bool`,
        docRef: 'docs/traps/trap-types-1.md',
        related: ['trap-bool-vs-bit', 'trap-interface-bool'],
        source: 'NEW — Batch 2 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'types-2',
        name: 'T0060 — Bit#(n) 位宽必须显式对齐',
        oneLiner: '表达式左右两侧位宽不匹配（如 Bit#(8) + Bit#(4)）触发 T0060。用 extend/truncate/zeroExtend/signExtend 对齐',
        why: 'BSV 编译器要求算术和逻辑表达式的操作数位宽匹配。与 Verilog 的隐式扩展不同，BSV 不自动扩展窄位宽操作数。所有操作数位宽不一致的情况必须用 zeroExtend、signExtend、truncate 或 extend 显式对齐。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['位宽', 'width', 'T0060', 'extend', 'truncate', 'zeroExtend', 'signExtend', 'Bit#', '类型', 'type', 'mismatch'],
        wrongCode: `Reg#(Bit#(8)) a <- mkReg(0);
Reg#(Bit#(4)) b <- mkReg(0);
rule compute;
    a <= a + b;  // T0060: Bit#(8) + Bit#(4) width mismatch
endrule`,
        correctCode: `Reg#(Bit#(8)) a <- mkReg(0);
Reg#(Bit#(4)) b <- mkReg(0);
rule compute;
    a <= a + zeroExtend(b);  // correct: zeroExtend b to Bit#(8)
endrule`,
        docRef: 'docs/traps/trap-types-2.md',
        related: ['trap-bool-vs-bit'],
        source: 'NEW — Batch 2 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'regfile-1',
        name: 'G0002 — mkRegFile 最多 5 读端口，超出用 mkRegFileFull',
        oneLiner: 'mkRegFile 的 maxReadPorts 硬限制为 5 个 sub 端口，超过触发 G0002。需更多端口用 mkRegFileFull',
        why: 'mkRegFile 内部实现使用有限数量的 BRAM 读端口，maxReadPorts 参数硬编码为 5。当模块中调用超过 5 个 rf.sub(N) 方法时，BSC 调度器检测到资源超额分配并报告 G0002。mkRegFileFull 使用不同的内部实现（更多 BRAM 资源消耗），无端口计数限制。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'design',
        pushTier: 'matched',
        keywords: ['RegFile', 'mkRegFile', 'mkRegFileFull', 'mkRegFileWCF', 'G0002', '读端口', 'read port', 'sub', 'BRAM'],
        wrongCode: `RegFile#(Bit#(5), Bit#(32)) rf <- mkRegFile(0, 31);
// 6 个 rf.sub() 调用 → G0002: 超出 5 读端口限制`,
        correctCode: `RegFile#(Bit#(5), Bit#(32)) rf <- mkRegFileFull;
// mkRegFileFull: 无读端口限制（更多 BRAM 资源）`,
        docRef: 'docs/traps/trap-regfile-1.md',
        related: ['trap-g0053'],
        source: 'NEW — Batch 2 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'synthesize-1',
        name: 'T0030 — 多态模块不能直接 synthesize，需用具体类型包裹',
        oneLiner: '带 type parameter 的模块加上 (* synthesize *) 触发 T0030。用具体类型的包装模块包裹多态模块',
        why: 'BSC 综合工具要求顶层模块的所有类型参数在编译时完全确定。多态模块（带 provisos 的 type t）的类型在实例化前不确定，综合工具无法生成具体 Verilog 网表。需要用具体类型（如 Bit#(32)）的 wrapper 包裹多态模块，或使用库中的具体版本。',
        severity: 'hard',
        bscDetectable: true,
        stage: 'design',
        pushTier: 'matched',
        keywords: ['synthesize', 'T0030', '多态', 'polymorphic', 'type parameter', '类型参数', 'provisos', 'wrapper'],
        wrongCode: `(* synthesize *)  // T0030: polymorphic module cannot synthesize
module mkQueue(FIFO#(t)) provisos (Bits#(t, sz_t));
    FIFO#(t) f <- mkFIFO;
    // ...
endmodule`,
        correctCode: `(* synthesize *)  // correct: concrete type wrapper
module mkQueue_32(FIFO#(Bit#(32)));
    FIFO#(Bit#(32)) f <- mkFIFO;
    // ...
endmodule`,
        docRef: 'docs/traps/trap-synthesize-1.md',
        related: ['synthesize-2', 'trap-p0022'],
        source: 'NEW — Batch 2 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
    },
    {
        id: 'synthesize-2',
        name: '顶层模块加 (* synthesize *) — 缺失不报错但不生成 Verilog',
        oneLiner: '顶层模块缺少 (* synthesize *) pragma 时 bsc 静默不生成 .v 文件（编译无报错），导致硬件综合失败',
        why: 'BSC 编译器只对带 (* synthesize *) pragma 的模块生成 Verilog 输出。不带该 pragma 的模块仅生成 .bo（Bluesim 对象）文件。这是 bsc 的设计选择——testbench 等仿真模块不需要 Verilog 输出。但缺少 synthesize 不会触发编译错误或警告，是静默失败。',
        severity: 'hard',
        bscDetectable: false,
        stage: 'code',
        pushTier: 'matched',
        keywords: ['synthesize', 'verilog', '.v', '生成', 'generate', '顶层', 'top', 'module', 'pragma', '静默'],
        wrongCode: `// Missing (* synthesize *) → compiles OK, no .v file generated
module mkMyTop(Empty);
    Reg#(Bit#(8)) r <- mkReg(0);
    // ...
endmodule`,
        correctCode: `(* synthesize *)  // correct: ensures .v generation
module mkMyTop(Empty);
    Reg#(Bit#(8)) r <- mkReg(0);
    // ...
endmodule`,
        docRef: 'docs/traps/trap-synthesize-2.md',
        related: ['synthesize-1', 'trap-attribute-1'],
        source: 'NEW — Batch 2 GRAPH backfill',
        bscVersions: ['2025.07'],
        verified: false,
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
        traps: [
            { text: '流水线级间寄存器冲突：相邻 stage 同 cycle 写入同一寄存器会触发 G0004。用阶段寄存器（如 mkRegU + 显式写入）隔离各 stage 的数据通路，避免同 cycle 读写同一寄存器。级间 handshake 用 FIFO 而不是裸寄存器', severity: 'hard', phase: 'both', bscVersions: ['2025.07'], verified: false, alwaysShow: true },
            { text: '流水线寄存器初始化遗漏：mkRegU 未初始化值在首个 cycle 导致不定态 X 传播。用 mkReg(initial_val) 或在首 cycle 用 rule 显式写入初始值，避免不定态进入流水线后续阶段后不可恢复', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: false, alwaysShow: true },
        ],
    },
    clock: {
        errors: ['BSV-PORTS'],
        refs: ['module', 'attributes'],
        pattern: 'clock_cross',
        traps: [
            { text: '跨时钟域信号未同步：BSV 中直接连线不同 Clock 域的模块会导致综合后亚稳态。数据通路用 mkSyncFIFO 逐 bit 同步，控制信号用 mkSyncBit05。时钟域边界必须在顶层模块接口处明确切分，不可在深层子模块中隐式跨域', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: false, alwaysShow: true },
            { text: 'ClockDomain 类型使用不当：mkClockDivider 返回的 Clock 需要配套 Reset。直接用 default_reset 跨 ClockDomain 会导致 reset 未同步到目标域，必须用 mkAsyncResetFromX（需暴露当前域 reset）生成目标域的同步 reset，否则仿真通过但硬件不定态', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false, alwaysShow: true },
        ],
    },
    reset: {
        errors: ['T0051', 'G0124'],
        refs: ['module'],
        keywords: ['reset', 'rst_n', 'rst', 'default_reset', 'resetn'],
        traps: [
            { text: 'Reset 类型需要显式 import Reset :: * —— 模块中写 `Reset rst` 但未导入 Reset package，触发 T0051 未定义类型错误', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'default_reset 在 BVI 中是 RST_N 而非 RST —— BVI import 时 default_reset 期望 Verilog port 名为 RST_N，RTL 中叫 RST 时需显式指定端口名 default_reset rst(RST)', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    axi: {
        errors: ['BSV-PORTS', 'G0010'],
        refs: ['module', 'attributes', 'patterns'],
        style: 'engineering',
        pattern: 'axi_stream',
        traps: [
            { text: 'AXI valid/ready 握手机制：valid 拉高后必须等 ready 为高当拍才能拉低，提前拉低 valid 会导致 transaction 丢失（从端可能尚未采样）。valid 和 data 必须同一 cycle 有效，BSC rule 调度器不会自动保证 AXI 握手协议时序完整性，需在 rule guard 中显式检查双方状态', severity: 'hard', phase: 'both', bscVersions: ['2025.07'], verified: false, alwaysShow: true },
            { text: 'AXI 通道间依赖关系：写响应（B channel）必须在最后一个写数据（W channel）之后才能返回，读响应（R channel）的返回顺序取决于 AR channel 的 burst 类型（INCR 可乱序，FIXED/WRAP 需保序）。各通道用独立 sub-rule 实现时需 descending_urgency 保证写通道内部顺序（AW→W→B）', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false, alwaysShow: true },
        ],
    },
    bram: {
        errors: ['G0004', 'T0060'],
        refs: ['stdlib'],
        pattern: 'bram',
        traps: [
            { text: 'BRAMCore: 读/写端口分离, BRAM: 单端口 — 选对类型', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
            { text: 'BRAM 数据位宽 vs 外部总线位宽对齐', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-19' },
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
        keywords: ['bvi', 'default_clock', 'default_reset', 'valueof', 'parameter', 'clocked_by', 'reset_by'],
        pattern: 'bvi',
        traps: [
            { text: 'default_clock / default_reset 必须写 —— BVI import 声明中缺少 default_clock 或 default_reset 导致 bsc 无法确定 Verilog 模块的时钟/复位端口映射，触发 G0124', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'parameter width = valueOf(sz_a) —— BVI interface parameter 的 type variable 必须通过 valueOf() 转为 Verilog parameter，直接写 parameter width = sz_a 触发 T0016', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    spi: {
        errors: ['T0051', 'T0060'],
        refs: ['stdlib'],
        pattern: 'spi',
        traps: [
            { text: 'SPI 命令字 Bit#(8), 移位寄存器匹配', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
            { text: 'CS/SCK/MOSI/MISO 信号命名统一', severity: 'style', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-19' },
        ],
    },
    crc: {
        errors: ['T0060', 'T0061'],
        refs: ['types'],
        pattern: 'crc',
        traps: [
            { text: 'CRC 多项式位宽确认', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-19' },
            { text: 'Bool vs Bit#(1) 区分 — done/error 等硬件控制信号用 Bit#(1)，便于位拼接和 interface 集成', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
        ],
    },
    uart: {
        errors: ['T0051', 'T0060'],
        refs: ['stdlib'],
        pattern: 'uart',
        traps: [
            { text: '波特率分频用 Bit#(n) 而非 Integer', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
            { text: 'UART 帧格式 start + 8bit + stop', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-19' },
        ],
    },
    struct: {
        errors: ['T0016', 'P0073'],
        refs: ['structs', 'types'],
        traps: [
            { text: 'struct 成员类型推导失败：BSV 中 struct 的 `defaultValue` 推导依赖所有字段类型可静态确定。包含 `Maybe#(t)` 或参数化类型的字段无法自动推导默认值，需显式定义 `defaultValue = StructName { field1: defaultValue, ... }` 或给每个字段指定默认值表达式', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: false, alwaysShow: true },
            { text: 'deriving 子句使用限制：`deriving(Bits)` 要求 struct 所有字段都是 `Bits` 类型族成员（Bit#(n)、Bool、Int#(n)、UInt#(n)），包含 Vector、FIFO、interface 类型字段的 struct 无法 derive Bits——编译器报 T0016 类型推导失败。此类 struct 需手写 pack/unpack 函数或将不可 pack 字段移到 struct 外部', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false, alwaysShow: true },
        ],
    },
    union: {
        errors: ['T0144', 'T0016'],
        refs: ['unions', 'types'],
        keywords: ['union', 'tagged'],
        traps: [
            { text: 'tagged 构造带数据的 tag 必须传参 —— union tagged { Valid Bit#(8) data; Invalid; } 中构造 tagged Valid 缺少 data 参数，触发 T0144', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    attribute: {
        errors: ['P0085', 'G0054', 'G0030', 'G0040', 'P0022'],
        refs: ['attributes'],
        keywords: ['attribute', 'pragma', 'synthesize', 'annotate', 'urgency'],
        traps: [
            { text: 'synthesize 不拼写成 synthesized —— 误写为 (* synthesized *)（过去分词）触发 P0085 未识别的 attribute pragma', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'urgency 规则名必须在本模块中存在 —— 写 (* descending_urgency = "rl_b, rl_a" *) 但 rl_a 拼写错误或不存在，触发 G0054', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    interface: {
        errors: ['P0073', 'G0010'],
        refs: ['module', 'patterns'],
        traps: [
            { text: '接口方法未实现：BSV 中 interface 声明了 method 但 module 未提供对应实现会触发 P0073（method not found）。compiler pragma 场景下（如 (* synthesize *)）interface 与 module 的 method 签名必须完全匹配（含参数类型、返回类型和隐式条件），即使类型兼容也不等于签名匹配', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false, alwaysShow: true },
            { text: '接口参数化时类型不匹配：interface 用 `#(type t)` 参数化时，module 实例化处必须传入具体类型且类型变量名一致。嵌套 interface 参数化时内层类型变量可能遮蔽外层同名变量，导致 T0016 类型推导失败。建议不同层级的类型参数使用不同名称以避免遮蔽', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: false, alwaysShow: true },
        ],
    },
    rule: {
        errors: ['G0004', 'G0010', 'G0054', 'G0030'],
        refs: ['schedule'],
        keywords: ['rule', 'schedule', 'rule-fire'],
        traps: [
            { text: '同一 rule 内同一 Reg 只写一次 —— 一条 rule 内对同一个寄存器执行两次 <= 写入，触发 G0004 并行写冲突', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    method: {
        errors: ['P0032', 'P0030', 'T0011', 'P0022'],
        refs: ['module'],
        keywords: ['method', 'interface'],
        traps: [
            { text: 'method 必须在所有 rule 之后 —— BSV module 中 method 定义块必须在所有 rule 定义之后，在 rule 之间或之前定义 method 触发 P0032', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'value method 用 = 而非 if-return —— value method 只能用 = expression 形式，用 = 后跟 if/return 块触发 P0030', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    types: {
        errors: ['T0061', 'T0051', 'T0060', 'T0132', 'T0020'],
        refs: ['types'],
        traps: [
            { text: 'Bool 用 ! 不用 ~ — 对 Bool 值用 ~ 触发 T0020。! 用于 Bool，~ 用于 Bit#(n)。对 Bit#(1) 用 ! 同样触发 T0020', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
            { text: 'Bit#(n) 位宽必须显式对齐 — 表达式左右侧位宽不匹配触发 T0060，用 zeroExtend/signExtend/truncate/extend 显式对齐', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
    vector: {
        errors: ['T0004'],
        refs: ['stdlib', 'types'],
        traps: [
            { text: 'vec() 在 BSC 2025.07 已移除 — 构造 Vector 用 replicateM(mkReg(0)) 或 genWith。旧版 BSV 代码中的 vec(element1, element2, ...) 触发 T0004', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-17' },
        ],
    },
    schedule: {
        errors: ['G0004', 'G0010', 'G0030', 'G0040', 'G0054', 'G0005', 'G0036'],
        refs: ['schedule'],
        traps: [
            { text: 'descending_urgency 不循环', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
            { text: 'execution_order 用于 SE 而非 SB', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-19' },
        ],
    },
    regfile: {
        errors: ['G0002', 'G0053'],
        refs: ['stdlib'],
        pattern: 'regfile',
        traps: [
            { text: 'mkRegFile 最多 5 读端口 — maxReadPorts 硬限制为 5，超出触发 G0002。需要更多读端口时用 mkRegFileFull（无端口限制但更多 BRAM 资源消耗）', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: false },
        ],
    },
    arbiter: {
        errors: ['G0002', 'G0004'],
        refs: ['stdlib', 'patterns'],
        pattern: 'arbiter',
        traps: [
            { text: '同一 cycle 超 5 读端口 → G0002', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
            { text: 'winner 丢失 → 需缓冲 FIFO', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-19' },
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
            { text: 'IRQ 信号用 Bit#(n) 便于多中断检测', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-19' },
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
            { text: 'GPIO 方向寄存器用 Bool 还是 Bit#(1) — 建议 Bit#(1) 可拼总线', severity: 'quality', phase: 'design', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-19' },
            { text: 'GPIO inout 信号通过 BVI 机制处理：BSV interface 中定义独立的 data_in、data_out、oe（output enable）method，Verilog wrapper 中用 assign io = oe ? data_out : \'bz 实现三态控制。Inout#() 包装器属于旧版 BSC 库用法，BSC 2025.07 中不推荐直接使用', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-18' },
            { text: '输出端口在顶层模块直接接 method', severity: 'quality', phase: 'code', bscVersions: ['2025.07'], verified: true, verifiedAt: '2026-07-19' },
        ],
    },
    synthesize: {
        errors: ['T0030', 'P0085', 'T0043', 'G0010'],
        refs: ['module', 'attributes'],
        traps: [
            { text: '多态模块不能直接 synthesize — 带 type parameter 的模块加 (* synthesize *) 触发 T0030。需用具体类型 wrapper 包裹', severity: 'hard', phase: 'design', bscVersions: ['2025.07'], verified: false },
            { text: '顶层模块必须加 (* synthesize *) — 缺失时 bsc 静默不生成 .v 文件（编译不报错），导致硬件综合失败', severity: 'hard', phase: 'code', bscVersions: ['2025.07'], verified: false },
        ],
    },
};

const KEYWORDS = Object.keys(GRAPH);

export function extractKeywords(text) {
    const lower = text.toLowerCase();
    const found = [];
    for (const [nodeName, node] of Object.entries(GRAPH)) {
        if (lower.includes(nodeName)) {
            found.push(nodeName);
        } else if (node.keywords) {
            for (const kw of node.keywords) {
                if (lower.includes(kw.toLowerCase())) {
                    found.push(nodeName);
                    break;
                }
            }
        }
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
 * **As of Q3 Direction 1 (MCP Elicitation)**: This function is now a FALLBACK only.
 * The primary phase resolution path is resolvePhase() in src/elicitation/elicit-phase.mjs,
 * which tries MCP elicitation first (Agent actively selects phase via form),
 * then falls back to inferPhase() keyword matching when elicitation is unsupported.
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
