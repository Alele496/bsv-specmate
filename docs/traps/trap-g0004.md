# trap-g0004 — G0004: 单 rule 内多子模块 Action 方法调用

> 一句话：同一 rule 内调用多个不同子模块的 Action 方法，BSC 判定为并行冲突——即使它们在互斥的 case/if 分支中。
> 严重度：hard | bsc感知：报错 | 阶段：both

## 为什么这是陷阱

BSC 的调度分析器在 rule 粒度上判断 Action 方法冲突。一个 rule 如果调用了两个不同子模块的 Action 方法（如 `subA.write(...)` 和 `subB.write(...)`），即使它们在互斥的条件分支中（不同 case、互斥 if-else），BSC 也会判定为并行调用冲突并报 G0004。

**根本原因**：BSC 的调度语义是硬件级的——它只分析同一个时钟周期内"哪些 Action 方法被调用了"，而不分析调用之间的控制流互斥关系。`descending_urgency` 和 `mutually_exclusive` 注解用于解决 rule 之间的冲突，但不能消除 rule 内部的 G0004。

## 错误表现

### bsc 报错（典型）

```
Error: "./I2C.bsv", line 89, column 5: (G0004)
  Rule `handle_transfer` uses methods that conflict in parallel:
    clk_cnt.write(...)
    fsm_state.write(...)
  The methods are called in the same rule and BSC cannot guarantee they
  will not execute simultaneously.
```

## 正确模式

```bsv
// ❌ 错误写法：一个 rule 内操作多个子模块
rule handle_transfer;
    case (state)
        IDLE: begin
            clk_cnt <= 0;           // 写 Reg clk_cnt
        end
        DATA: begin
            fsm_state <= NEXT;      // 写 Reg fsm_state
        end
    endcase
endrule

// ✅ 正确写法：拆成多条 rule，每条只操作一个子模块
rule reset_counter (state == IDLE);
    clk_cnt <= 0;
endrule

rule advance_fsm (state == DATA);
    fsm_state <= NEXT;
endrule

// 用 descending_urgency 控制 rule 间的优先级（如果需要互斥）
(* descending_urgency = "reset_counter, advance_fsm" *)
```

## BSC 参考

- BSV LRM §12.3 调度语义
- BSC User Guide §8.2 "Rule Scheduling"

## 实际案例

07-i2c bench 实验：Agent A 卡了 6 轮编译无法通过，直接原因就是同一个 rule 内同时写 `clk_cnt` 和所有 FSM 寄存器。每次 Agent 尝试调整逻辑但不拆 rule，BSC 始终报 G0004。案例也促使了 `preflight.mjs` 中 `scanG0004` 的加入。

## 关联陷阱

- trap-g0053 — G0053: mkReg 用模块参数初始化（同样涉及子模块实例化规则）
- trap-always-ready-guard — always_ready/enabled 与 guard 条件矛盾（涉及调度语义）
