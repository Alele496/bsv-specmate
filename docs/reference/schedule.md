# Rule 调度与注解

> BSV 中 rule 的调度控制和注解语法。

## 基本调度规则

BSV 编译器自动推断 rule 之间的调度关系，但可显式标注。

### 调度关系

| 关系 | 含义 |
|------|------|
| **CF** (Conflict Free) | 两个 rule 可以并行执行 |
| **SB** (Sequentially Before) | A 必须在 B 之前执行 |
| **SBR** (Sequentially Before, Restrict) | A 在 B 之前，且不能并行 |
| **ME** (Mutually Exclusive) | 两个 rule 永远不会同时触发 |

### 注解语法

BSV 使用 `(* ... *)` 属性注解，放在 rule 或 module 之前：

```bsv
(* descending_urgency = "rl_high, rl_low" *)
(* mutually_exclusive = "rl_a, rl_b" *)
(* conflict_free = "rl_a, rl_b" *)
(* execution_order = "rl_a, rl_b, rl_c" *)
(* preempts = "rl_a, rl_b" *)       // rl_a 抢占 rl_b
```

### 多对关系

```bsv
// 多条关系用逗号分隔
(* descending_urgency = "rl_a, rl_b, rl_c" *)

// rule 名用逗号间隔
(* mutually_exclusive = "rl_read, rl_write, rl_clear" *)
```

## 常用注解场景

### 1. descending_urgency（降低 urgency）

当一个 module 内部 rule 调用另一个 module 的 method 时，需要显式标注优先级：

```bsv
(* descending_urgency = "rl_dac_consume, dac_rl_spi" *)
rule rl_dac_consume;
    dac.command(...);       // 调用子模块 method
endrule

(* descending_urgency = "rl_uart_tx_send, utx_rl_tx" *)
```

> 详见 `lookup_error("G0010")`

### 2. mutually_exclusive（互斥）

两个 rule 的 guard 条件互斥，永远不同时触发：

```bsv
(* mutually_exclusive = "rl_send, rl_recv" *)
```

### 3. conflict_free（无冲突）

两个 rule 访问不同资源，可以独立执行：

```bsv
(* conflict_free = "rl_a, rl_b" *)
```

### 4. execution_order（执行顺序）

强制指定 rule 的执行顺序：

```bsv
(* execution_order = "rl_first, rl_second, rl_third" *)
```

### 5. fire_when_enabled（始终触发）

rule 的 guard 条件满足时无条件触发：

```bsv
(* fire_when_enabled *)
rule rl_process;
    // 当 guard 条件满足时一定执行
endrule
```

### 6. no_implicit_conditions（无视隐式条件）

rule 不考虑方法隐式条件：

```bsv
(* fire_when_enabled, no_implicit_conditions *)
rule rl_always;
    // 忽略所有隐式条件（谨慎使用）
endrule
```

## 调度问题排查

### G0010（跨 rule 方法冲突）

| 现象 | 原因 | 解决 |
|------|------|------|
| 编译器 Warning: "treated as more urgent" | 外部 method 写入 + 内部 rule 读取 | 加 `descending_urgency` |
| 跨 rule 数据丢失 | PulseWire + Reg 组合 | 改用 FIFOF |

### G0004（单 rule 内并行写冲突）

| 现象 | 原因 | 解决 |
|------|------|------|
| "methods that conflict in parallel" | case default 写入与 case 内相同寄存器 | 删除 default 分支，枚举类型已穷举 |

## 调度最佳实践

1. **默认由编译器推断** — 大部分情况下不写注解也能正确调度
2. **警告不要忽略** — G0010 warning 可能导致仿真时功能异常
3. **数据传递用 FIFOF** — 跨 rule 不要用 PulseWire+Reg
4. **枚举类型不要 default** — 已穷举的 case 删掉 default 避免 G0004
