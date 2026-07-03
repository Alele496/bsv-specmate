# BSV 设计模式

> 从生产级 BSV 开源项目中蒸馏的通用设计范式。来源：[open-rdma-rtl](https://github.com/myrfy001/open-rdma-rtl) 项目。

## 1. 两段寄存器（CReg 隔离读写冲突）

**场景**：多个操作需在同一个 cycle 内读写同一寄存器但又不能冲突。

**模式**：用 `mkCReg(2, v)` 创建两份寄存器副本，隔离写和加减操作。

```bsv
Reg#(Bit#(8)) cnt <- mkCReg(2, 0);

rule rl_incr;
    cnt[0] <= cnt[0] + 1;           // 端口 0 写入
endrule

rule rl_read_and_decr;
    let v = cnt[1];                  // 端口 1 读取
    cnt[1] <= v - 1;                 // 端口 1 写入
endrule
```

> **关键**：不同端口可以独立读写，编译器自动调度。端口数 = CReg 构造参数。

## 2. 管道缓冲层次（B0/B1/B2）

**场景**：拆长组合路径，插入流水寄存器。

**模式**：三级缓冲协议：
- **B0** — 零缓冲直通（组合路径，wire）
- **B1** — 单缓冲（`LFIFOF`，deq→enq 组合路径）
- **B2** — 双缓冲（`mkFIFOF` 2 元素，完全寄存器隔离）

```bsv
// 管道连接模式
let stage1 <- mkSomeModule;
let stage2 <- mkSomeModule;

// B1 缓冲：插入 LFIFOF（可以同时读写）
FIFOF#(t) buf <- mkLFIFOF;
mkConnection(stage1.out, buf);
mkConnection(buf, stage2.in);

// 或 B2 缓冲：完全寄存器隔离
FIFOF#(t) buf <- mkFIFOF;
```

## 3. 多通道保序仲裁器

**场景**：多个数据流共享输出通道，需保持每个流内部顺序。

**模式**：每个通道维护 `KeepOrderQueue`，仲裁器首次授权后保持对同一通道的授权直到当前事务结束。

```bsv
// 流仲裁器结构
interface StreamArbiter#(type t, numeric type nCh);
    method Action enq(Bit#(nCh) ch, t data);
    method Maybe#(t) deq;
endinterface

// 内部：
// 1. 独立 readers/writers 仲裁器
// 2. per-channel 保序队列
// 3. 首拍仲裁后锁定通道
```

## 4. Ring Buffer 消费者（DMA 预取）

**场景**：生产者异步写入环形缓冲区，消费者从缓冲区消费数据。

**模式**：shadow pointer 机制 — 分离实际指针和预取指针。

```bsv
typedef struct {
    Bit#(w)  idx;
    Bit#(1)  guard;   // 环绕位（区分空/满）
} RingbufPointer#(numeric type w);

// 消费者
Reg#(RingbufPointer#(w)) tail     <- mkReg(...);  // 实际消费位置
Reg#(RingbufPointer#(w)) shadow   <- mkReg(...);  // 预取位置

// 预取：shadow 提前向 DMA 发请求
// 消费：tail 追上 shadow
```

## 5. BVI 双模封装（BSV 仿真 + Vendor 综合）

**场景**：仿真用 Bluespec 纯 BSV 实现，综合用厂商优化的 Verilog IP。

**模式**：

```bsv
module mkAutoBram(MyBRam#(tAddr, tData))
    provisos (Bits#(tAddr, szAddr), Bits#(tData, szData));

    MyBRam#(tAddr, tData) inst;
    if (genVerilog) begin
        // 综合时：用 BVI import 的厂商 Verilog
        inst <- mkAutoBramBVI("bram_wrapper.v");
    end else begin
        // 仿真时：用纯 BSV 实现
        inst <- mkAutoBramBSV;
    end
    return inst;
endmodule
```

## 6. 流水线反压验证框架

**场景**：仿真时检测管道反压（backpressure）bug。

**模式**：流水检查器跟踪每拍的间隔，检测反压引起的性能回退。

```bsv
interface PipelineChecker;
    method Action check();     // 每拍调用
    method Action report();    // 仿真结束报告
endinterface

module mkPipelineChecker(PipelineChecker);
    Reg#(Bit#(32)) cycle    <- mkReg(0);
    Reg#(Bit#(32)) lastGood <- mkReg(0);

    rule tick;
        cycle <= cycle + 1;
    endrule

    method Action check();
        Bit#(32) gap = cycle - lastGood;
        if (gap > 1) begin
            $display("WARN: Pipeline stall at cycle %0d, gap=%0d", cycle, gap);
        end
        lastGood <= cycle;
    endmethod
endmodule
```

## 7. CSR 树形路由

**场景**：大量控制/状态寄存器，需要分层地址路由。

**模式**：8 路 fork 节点 + 地址匹配函数，构建 CSR 树。

```bsv
function ActionValue#(CsrResult) csrMatch(CsrReq req);
    if (req.addr >= base && req.addr < base + range)
        return tagged CsrResultForward ch;
    else
        return tagged CsrResultNotMatch;
endfunction

CsrNodeFork8 node <- mkCsrNode(csrMatch, ...);
// 自动分配子节点到 fork 0-7
```

---

## 如何查询这些模式

Agent 通过 `lookup_ref(topic="patterns")` 获取本文档。更多具体实现参考 `lookup_example(keyword="xxx")` 搜索官方用例。
