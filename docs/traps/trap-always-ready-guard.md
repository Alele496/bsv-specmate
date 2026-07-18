# trap-always-ready-guard — always_ready 声明与隐式条件矛盾

> 一句话：interface 声明 `(* always_ready *)` 但实现调用有条件子模块方法（如 fifo.first()）→ bsc 不报错，调度器误判 method 每周期可用。
> 严重度：quality | bsc感知：不报错 | 阶段：both

## 为什么这是陷阱

`(* always_ready *)` 是 BSV interface 声明中的属性，告诉调度器该 value method 每周期返回有效值（无隐式条件）。当模块实现中调用子模块方法时，子模块方法的隐式条件会向上传播——如 `fifo.first()` 传播 `notEmpty` 条件。

**bsc 不检查 interface 属性声明与实现的一致性**。只要 interface 声明了 `(* always_ready *)`，调度器就按"无条件可用"处理，即使实际实现中存在隐式条件。

注意：`always_ready`/`always_enabled` 只能以 `(* attribute *)` pragma 形式出现在 **interface 声明**中。在模块 method 实现处使用 pragma 形式会触发 P0022，使用后缀关键字形式会触发 P0005（不被识别）。

## 错误表现

### 编译通过但行为错误

- 调度器不认为 method 有隐式条件，可能错误地允许并发调用
- 调用方在不满足条件时调用 method（如 FIFO 为空时读 first()），获取未定义值
- 仿真可能侥幸通过（FIFO 刚好不为空），但综合后硬件行为不确定

## 正确模式

```bsv
// ❌ 错误写法：interface 声明 always_ready，但实现调 fifo.first()
interface ValIFC;
    (* always_ready *) method Bit#(8) val();
endinterface

module mkVal(ValIFC);
    FIFO#(Bit#(8)) fifo <- mkFIFO;
    method Bit#(8) val();
        return fifo.first();  // fifo.first() 有隐式 notEmpty 条件！
    endmethod
endmodule

// ✅ 方案 1：去掉 always_ready，让调度器识别隐式条件（推荐）
interface ValIFC;
    method Bit#(8) val();  // 调度器从实现推断隐式条件
endinterface

// ✅ 方案 2：确保实现真正无隐式条件（纯组合逻辑）
interface ValIFC;
    (* always_ready *) method Bit#(8) val();
endinterface

module mkVal(ValIFC);
    Reg#(Bit#(8)) data <- mkReg(0);
    method Bit#(8) val();
        return data;  // 纯读寄存器，无隐式条件 ← 与 always_ready 一致
    endmethod
endmodule
```

## BSC 参考

- BSV LRM §8.2 method 属性
- BSC User Guide §5.1 "Method Attributes"
- BSC 2025.07: `(*)` pragma 在 module method 实现处触发 P0022

## 实际案例

1. 07-14 危机分析：发现多个 bench 实验中 Agent 在所有 method 上滥用 `always_ready`，包括有明显 guard 条件的方法。这导致 specmate 新增了 `checkAlwaysAttrMisuse` 检查规则。

2. 03-axistream bench 实验：Agent B 在全部 method 上标记 always_ready，其中多个 method 有显式 guard 条件（如检查 internal buffer 是否有数据）。这些 guard 被 always_ready 声明覆盖，导致下游 FSM 在 buffer 为空时仍读取数据。

## 关联陷阱

- trap-g0004 — G0004: 单 rule 内同一子模块的多个 Action method 调用（同样涉及调度语义）
- trap-p0022 — P0022: Module method 实现用 pragma 而非 suffix（属性语法层面的易错点）
