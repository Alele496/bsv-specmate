const PATTERNS = {
    fifo: {
        name: 'FIFO 点对点传递',
        keywords: ['fifo', 'mkfifo', 'mkfifof', 'mkbypassfifo', 'mklfifo', 'mkbramfifo', 'mksizedfifo', 'mkpipelinefifo'],
        skeleton: `import FIFOF::*;

FIFOF#(DataType) data_fifo <- mkFIFOF;

rule pass_data;
    data_fifo.enq(input_val);
endrule

rule consume_data;
    let val = data_fifo.first;
    data_fifo.deq;
endrule`,
        variants: {
            '数据需要同周期 enq/deq (bypass)': 'mkBypassFIFO — 组合旁路，但 G0010 高风险',
            '大容量 (≥16 深度)': 'mkLFIFO(16) — BRAM-backed，面积小',
            '需要 notFull/notEmpty 信号': 'mkFIFOF — 支持这些方法',
            '需要记录 deq 计数': 'mkSizedFIFO — 提供 count()',
            '流水线 (多级寄存器)': 'mkPipelineFIFO — 插入流水级',
        },
        traps: ['G0010: enq/deq 不要跨 rule', 'BypassFIFO 虽然灵活但 G0010 风险远大于 mkFIFO'],
        cross: ['stdlib'],
    },

    bram: {
        name: 'BRAM 缓冲 / 查找表',
        keywords: ['bram', 'bramcore', 'bramfifo', 'mkbram', 'regfile'],
        skeleton: `import BRAMCore::*;

BRAM_Configure cfg = defaultValue;
cfg.memorySize = valueOf(SizeOf#(DataType));
cfg.loadFormat = tagged Raw "init.hex";

BRAM2Port#(AddrType, DataType) bram <- mkBRAM2Server(cfg);

rule write_port;
    bram.portA.request.put(BRAMRequest{write: True, address: waddr, datain: wdata});
endrule

rule read_port;
    bram.portB.request.put(BRAMRequest{write: False, address: raddr, datain: ?});
endrule`,
        variants: {
            '单端口 (简单缓冲)': 'BRAM1Port — 读写同一 port，但注意 G0004',
            '双端口 (同时读写)': 'BRAM2Port — portA 写 portB 读，无冲突',
            '只读查找表 (ROM)': 'mkBRAMCore1Load — 初始化后只读',
            '大量存储 (≥KB)': 'BRAMServer — 最通用的 BRAM 接口',
        },
        traps: ['G0004: BRAM 读写同 port 时产生并行写冲突', 'BRAMCore 需要手动管理 enable 和地址', 'T0060: BRAM 位宽 vs 外部总线位宽对齐'],
        cross: ['stdlib'],
    },

    fsm: {
        name: 'FSM 状态机',
        keywords: ['fsm', 'state machine', 'mkfsm', 'stmtfsm', 'case state'],
        skeleton: `typedef enum { IDLE, WORKING, DONE } State deriving (Bits, Eq);

Reg#(State) state <- mkReg(IDLE);

rule do_fsm;
    case (state)
        IDLE: begin
            if (start_cond) begin
                // 初始化
                state <= WORKING;
            end
        end
        WORKING: begin
            // 工作逻辑
            if (done_cond) state <= DONE;
        end
        DONE: begin
            state <= IDLE;
        end
    endcase
endrule`,
        variants: {
            '简单线性状态': 'enum + case — 最直观，手工管理',
            '复杂多向跳转': 'StmtFSM — mkFSM 语法，自动生成 case 代码',
            '多模块 FSM': '每个子模块各自的 state Reg，顶层协调',
        },
        traps: ['G0004_FSM: 同 cycle 写多个子模块 → 拆为独立 rule', 'P0030: value method 用 if-return 而非 ?: 三元链', 'case 勿忘 default 值'],
        cross: ['patterns', 'module'],
    },

    pipeline: {
        name: '流水线 Pipeline',
        keywords: ['pipeline', 'pipe', 'stage', '流水线', 'mkshiftregister'],
        skeleton: `FIFOF#(Stage1Out) s1_to_s2 <- mkFIFOF;
FIFOF#(Stage2Out) s2_to_s3 <- mkFIFOF;

rule stage1;
    let in_val = input_fifo.first;
    input_fifo.deq;
    let out_val = process_stage1(in_val);
    s1_to_s2.enq(out_val);
endrule

rule stage2;
    let val = s1_to_s2.first;
    s1_to_s2.deq;
    let out_val = process_stage2(val);
    s2_to_s3.enq(out_val);
endrule`,
        variants: {
            '固定 latency': 'ShiftRegister — 延迟固定周期',
            '可变 latency': 'FIFO 级联 — 每级独立仲裁',
            '多路分发': '分布式 pipeline — mkPipelineFIFO',
        },
        traps: ['G0010: FIFO enq/deq 跨 rule — 用 mkFIFOF 显式分离', 'G0004: 同 rule 内操作多个 FIFO', '流水线平衡 — 慢 stage 会 backpressure 全链路', '设计: 流水线各级之间的 backpressure 必须逐级传递——末级反压要能阻塞首级输入', '设计: 不要贪心插太多 pipeline 级——每增加一级就是一拍的延迟，影响吞吐'],
        cross: ['patterns', 'schedule', 'stdlib'],
    },

    clock_cross: {
        name: '跨时钟域',
        keywords: ['clock', 'cross clock', 'sync', 'mksyncfifo', 'mksyncbramfifo', 'crossing', 'mknullcrossing'],
        skeleton: `import Clocks::*;
import Connectable::*;

Clock clk_dst <- exposeCurrentClock;

SyncFIFOIfc#(DataType) sync_fifo <- mkSyncFIFO(4, clk_src, rst_src, clk_dst);

rule enq_src;
    sync_fifo.enq(data);
endrule

rule deq_dst;
    let val = sync_fifo.first;
    sync_fifo.deq;
endrule`,
        variants: {
            '两点同步 FIFO': 'mkSyncFIFO — 中等深度，常见',
            '大容量跨时钟 FIFO': 'mkSyncBRAMFIFO — BRAM-backed',
            '位同步 (bit synchronizer)': 'mkSyncBit — 单 bit 去 metastability',
            '同源时钟 (无需同步)': 'mkNullCrossing — 不同时钟但同源，无需同步电路',
        },
        traps: ['Clock 类型需 import Clocks::*', 'dstClk 必须显式传入', 'BSV-PORTS: 跨时钟域端口命名 vs Verilog 端口名不一致'],
        cross: ['module', 'attributes'],
    },

    spi: {
        name: 'SPI 控制器',
        keywords: ['spi', 'mosi', 'miso', 'sclk', 'cs', 'shift register'],
        skeleton: `Reg#(Bit#(8)) shift_reg <- mkReg(0);
Reg#(Bit#(3)) bit_cnt <- mkReg(0);

rule spi_shift;
    if (bit_cnt < 8) begin
        shift_reg <= {shift_reg[6:0], miso};
        bit_cnt <= bit_cnt + 1;
    end
endrule`,
        variants: {
            'SPI Master': '手动控制 CS/SCK/MOSI',
            'SPI Slave': '监听 CS/SCK，响应时 shift',
            'SPI Flash 专用': '命令 + 地址 + 数据三段 shift',
        },
        traps: ['T0051: SPI 命令字 Bit#(8) 注意位宽', 'T0060: 移位寄存器宽度 vs 接收数据宽度', 'SCK 分频用 Bit#(n) 而非 Integer', '设计: SPI 标准是 MSB-first（高位先出）。若设备要求 LSB-first，必须在接口文档中明确标注', '设计: 用 FIFO 缓冲命令和响应，避免 busy 期间新命令丢失或上一结果被覆盖', '设计: CPHA=0 和 CPHA=1 的完成检测点不同（差一位），不要在两个模式间共享同一个 bit counter 阈值'],
        cross: ['stdlib'],
    },

    uart: {
        name: 'UART 收发器',
        keywords: ['uart', 'baud', 'serial', 'tx', 'rx', '波特率'],
        skeleton: `Reg#(Bit#(16)) baud_counter <- mkReg(0);
Reg#(Bit#(8)) tx_data <- mkReg(0);

rule tx_shift (tx_busy);
    if (baud_counter == 0) begin
        tx_data <= {1'b0, tx_data[7:1]};
        baud_counter <= baud_div;
    end else begin
        baud_counter <= baud_counter - 1;
    end
endrule`,
        variants: {
            '轻量 UART TX': '单 rule + Bit#(10) shift reg + 波特率分频',
            '全双工 UART': 'TX rule + RX rule 互不冲突',
            '带 FIFO buffer': 'TX/RX 各一个 mkFIFOF 缓冲',
        },
        traps: ['波特率分频用 Bit#(n) 而非 Integer', 'UART 帧格式 start + 8bit + stop = 10 bits', 'RX oversampling 用 16x 波特率采样', '设计: RX 端需要一个 start bit 检测器（下降沿+半位周期确认），不能直接靠电平判断', '设计: 波特率分频值 = 系统时钟 / 目标波特率 / 采样倍率（RX 一般用 16x oversampling）'],
        cross: ['stdlib'],
    },

    axi_stream: {
        name: 'AXI4-Stream 接口',
        keywords: ['axi', 'axi4', 'axi stream', 'tvalid', 'tready', 'tdata'],
        skeleton: `import AXI4_Stream::*;

AXI4_Stream_Master#(DataWidth, UserWidth) axi_m <- mkAXI4_Stream_Master;

rule drive_axi;
    axi_m.tx.put(AXI4_Stream_Payload{
        tdata: data,
        tkeep: '1,
        tlast: is_last,
        tid: 0,
        tdest: 0,
        tuser: 0
    });
endrule`,
        variants: {
            'AXI4-Stream Master': 'mkAXI4_Stream_Master — TX 方向',
            'AXI4-Stream Slave': 'mkAXI4_Stream_Slave — RX 方向',
            'AXI4-Lite (寄存器读写)': 'AXI4_Lite_Slave — 控制寄存器接口',
            'AXI4-Full (存储器)': '需 AMBA_TLM3 或 AMBA_Fabrics',
        },
        traps: ['BSV-PORTS: AXI4 接口 port 名与 BSV method 名不一致', 'tkeep = replicate(1) 表示所有 byte lanes 有效', 'G0010: AXI master/slave 方法调用跨 rule', '设计: 反压必须级联——下游 tready=0 时必须暂停上游，不能丢弃数据', '设计: 宽度转换时用状态机追踪当前字节位置（0/1/2/3），不要靠移位寄存器隐式计数', '设计: 拆分顺序必须一致（大端 MSB-byte-first 或小端 LSB-byte-first），选定后在接口文档中标注'],
        cross: ['module', 'attributes', 'patterns'],
    },

    bvi: {
        name: 'BVI Import (Verilog 封装)',
        keywords: ['bvi', 'import bvi', 'verilog wrapper', 'clocked_by', 'reset_by'],
        skeleton: `import "BVI" MyModule =
module vMkMyModule #(Clock clk, Reset rst, MyIfc ifc)
    provisos (Bits#(a, sz_a));

    default_clock clk(CLK);
    default_reset rst(RST_N);

    parameter width = valueOf(sz_a);

    method do_something(DATA_IN) enable(EN);
    method RESULT_OUT result();

    schedule do_something C do_something;
    schedule result CF result;
endmodule`,
        variants: {
            '简单 Verilog wrapper': 'BVI import + default_clock/reset',
            '跨时钟域 BVI': '显式 input_clock/output_clock + clocked_by',
            '多时钟 BVI': '每 port 单独 clocked_by + reset_by',
        },
        traps: ['default_reset 是 RST_N 而非 RST', 'parameter width = valueOf(sz_a) 模板', 'G0124: BVI method 名 vs Verilog port 名不匹配'],
        cross: ['attributes', 'module'],
    },

    arbiter: {
        name: '仲裁器 Arbiter',
        keywords: ['arbiter', 'arbitrate', 'round robin', 'priority', 'mux', '仲裁'],
        skeleton: `import Arbitrate::*;

Vector#(4, FIFOF#(ReqType)) reqs <- replicateM(mkFIFOF);
FIFOF#(ReqType) winner <- mkFIFOF;

rule arbitrate;
    Vector#(4, Bool) valids = map(isNotEmpty, reqs);
    Maybe#(UInt#(2)) idx = findIndex(id, valids);
    if (idx matches tagged Valid .i) begin
        reqs[i].deq;
        winner.enq(reqs[i].first);
    end
endrule`,
        variants: {
            'Round-Robin (公平轮询)': '自定义状态 + current_index',
            '优先级 (固定顺序)': 'Arbiter + fixed priority',
            '矩阵仲裁 (输入×输出)': 'Crossbar — mkXBar 标准库',
        },
        traps: ['G0002: 同一 cycle 超过 5 个 read port → mkRegFileFull 限制', '同 cycle 多个 req → winner 丢失 → 需要缓冲 FIFO'],
        cross: ['stdlib', 'patterns'],
    },

    serialize: {
        name: '串行化 / 反串行化 (SerDes)',
        keywords: ['serialize', 'deserialize', 'serdes', 'shift', 'parallel', 'unpack', 'pack'],
        skeleton: `Reg#(Bit#(WIDTH)) shift_reg <- mkReg(0);
Reg#(UInt#(T_LOGW)) cnt <- mkReg(0);

rule serialize;
    if (cnt == 0) begin
        shift_reg <= unpack(data_in);
        cnt <= fromInteger(valueOf(T_LOGW) - 1);
    end else begin
        out_bit <= shift_reg[0];
        shift_reg <= shift_reg >> 1;
        cnt <= cnt - 1;
    end
endrule`,
        variants: {
            'Bit 序列化 (LSB first)': 'shift_reg >> 1 + cnt 计数',
            'Byte 序列化 (LSB first)': 'shift_reg >> 8 + 8-bit 步进',
            '固定 latency 反序列化': 'ShiftRegister + 定时锁存',
        },
        traps: ['T0060: shift reg 位宽 vs 外部总线宽度对齐', 'T0051: 计数器的位宽计算 = log2(data_width)'],
        cross: ['types', 'stdlib'],
    },

    regfile: {
        name: '寄存器文件 RegFile',
        keywords: ['regfile', 'mkregfile', 'mkregfilefull', 'register file'],
        skeleton: `import RegFile::*;

RegFile#(Bit#(AddrW), DataType) rf <- mkRegFileFull;

rule read_op;
    DataType val = rf.sub(addr);
endrule

rule write_op;
    rf.upd(addr, data);
endrule`,
        variants: {
            '全部地址可读可写': 'mkRegFileFull — 最简单',
            '限定地址范围': 'mkRegFile(lo, hi) — 指定范围',
            'BRAM 替代 (大容量)': 'mkBRAMCore + wrapper 转 RegFile 接口',
        },
        traps: ['G0002: RegFile 最多 5 read ports — 超了报错', '同 cycle 读写同一地址 → G0004'],
        cross: ['stdlib', 'schedule'],
    },

    crc: {
        name: 'CRC 校验',
        keywords: ['crc', 'checksum', 'polynomial', '校验'],
        skeleton: `Reg#(Bit#(CRC_W)) crc_reg <- mkReg(0);

rule crc_shift;
    if (crc_cnt > 0) begin
        Bit#(1) msb = crc_reg[valueOf(CRC_W)-1];
        crc_reg <= {crc_reg[valueOf(CRC_W)-2:0], 1'b0} ^ 
                   (msb == 1 ? POLYNOMIAL : 0);
        crc_cnt <= crc_cnt - 1;
    end
endrule`,
        variants: {
            'CRC-8 / CRC-16 / CRC-32': '多项式 + 位宽替换即可',
            'LFSR (线性反馈)': '类似 CRC 的简化版 — 仅反馈不异或数据',
            '并行的 CRC (组合逻辑)': '用 function 一次计算全字',
        },
        traps: ['T0061: crc_done 是 Bool，不是 Bit#(1)', 'T0060: CRC_W 宽度的多项式对齐', 'CRC 初始值 = ~0 而非 0'],
        cross: ['types'],
    },

    interrupt: {
        name: '中断控制器',
        keywords: ['interrupt', 'irq', 'isr', '中断', 'vector'],
        skeleton: `Reg#(Bit#(IRQ_N)) irq_pending <- mkReg(0);
Reg#(Bit#(IRQ_N)) irq_mask <- mkReg(maxBound);

rule irq_handler;
    Bit#(IRQ_N) active = irq_pending & irq_mask;
    if (active != 0) begin
        let irq_idx = priorityEncode(active);
        // 跳转到对应 ISR
        irq_pending[irq_idx] <= 0;
    end
endrule`,
        variants: {
            '简单 boolean 中断': 'Reg#(Bool) irq — 一个信号',
            '多中断源 + 优先级': 'priority encoder → 支持嵌套',
            '向量中断': 'irq_idx → lookup table → ISR 地址',
        },
        traps: ['中断信号用 Bit#(IRQ_N) 便于位操作 — 多个 IRQ 同时有效可检测', '中断掩码 mask 的位宽必须与 pending 一致'],
        cross: ['types', 'patterns'],
    },

    encoder: {
        name: '优先编码器 (Priority Encoder)',
        keywords: ['encoder', 'priority encoder', '优先编码', 'findIndex', 'findindex'],
        skeleton: `import Vector::*;

// 优先编码器：找 req 中最低位为 1 的索引（bit 0 优先级最高）
function Bit#(TLog#(n)) priorityEncode(Bit#(n) req);
    Vector#(n, Bit#(1)) reqVec = unpack(pack(req));
    Maybe#(UInt#(TLog#(n))) m_idx = findIndex(
        \\== (1),
        reqVec
    );
    return case (m_idx) matches
        tagged Valid .x: pack(x);
        tagged Invalid: 0;
    endcase;
endfunction`,
        variants: {
            '纯组合逻辑 (无寄存器)': '用 function + findIndex — 一行搞定，延迟最小',
            '带 valid 输出': '接口加 method Bit#(1) valid(Bit#(32) req) = pack(req != 0)',
            '任意输入位宽 N': '参数化: Bit#(N) req → Bit#(TLog#(N)) idx',
        },
        traps: ['不要用 foldl 手工遍历 Vector — findIndex 是标准库原语', 'valid 信号用 Bit#(1) 不用 Bool', '索引用 UInt 不用 Integer', '\\== (1) 是部分应用语法，不要用 function lambda'],
        cross: ['stdlib', 'types'],
    },
};

export function searchPatterns(keywords) {
    const results = [];
    for (const [id, p] of Object.entries(PATTERNS)) {
        const matchScore = countMatches(keywords, p.keywords);
        if (matchScore > 0) {
            results.push({ ...p, id, score: matchScore });
        }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
}

export function getPattern(id) {
    return PATTERNS[id] || null;
}

function countMatches(inputKeywords, patternKeywords) {
    let score = 0;
    for (const ik of inputKeywords) {
        const lower = ik.toLowerCase();
        for (const pk of patternKeywords) {
            if (lower.includes(pk.toLowerCase()) || pk.toLowerCase().includes(lower)) {
                score += 2;
            }
        }
    }
    return score;
}
