# Rule 调度与注解

> BSV 中 rule 的调度控制和注解语法。蒸馏自 [BSV 中文教程](https://github.com/WangXuan95/BSV_Tutorial_cn)。

---

## 调度注解 (Scheduling Annotation)

BSV 规定了六种调度注解，描述两个方法 mA 和 mB 之间的逻辑执行顺序：

| 注解 | 顺序要求 | 能否同规则 | 说明 |
|------|---------|----------|------|
| **CF** | mA 和 mB 可任意顺序 | ✅ 可同规则 | Conflict Free |
| **SB** | mA 必须在 mB 之前 | ✅ 可同规则 | Sequentially Before（与 SA 互逆） |
| **SA** | mA 必须在 mB 之后 | ✅ 可同规则 | Sequentially After（与 SB 互逆） |
| **SBR** | mA 必须在 mB 之前 | ❌ 必须不同规则 | SB + Restricted（与 SAR 互逆） |
| **SAR** | mA 必须在 mB 之后 | ❌ 必须不同规则 | SA + Restricted（与 SBR 互逆） |
| **C** | mA 和 mB 无法同周期 | ❌ 必须不同规则 | Conflict |

### 寄存器调度注解

| mkReg / mkRegU / mkDReg | `_read` | `_write` |
|------------------------|---------|---------|
| **`_read`** | **CF** | **SB** |
| **`_write`** | **SA** | **SBR** |

解读：
- `_write` **SBR** `_write` → 同一寄存器不能在同一规则内写两次 → **G0004**
- `_read` **SB** `_write` → 读在写之前，保证读到旧值

---

## 规则注解语法

BSV 使用 `(* ... *)` 放在 rule 或 module 之前：

```bsv
(* descending_urgency = "r1, r2" *)       // r1 紧急性高于 r2
(* mutually_exclusive = "r1, r2" *)       // r1 和 r2 永远不同时激活
(* conflict_free = "r1, r2" *)            // r1 和 r2 可同时激活，但无冲突
(* preempts = "r1, r2" *)                 // r1 抢占 r2（强制冲突 + 指定紧急性）
(* execution_order = "r1, r2, r3" *)      // 强制执行顺序
```

多规则：
```bsv
(* descending_urgency = "r_high, r_mid, r_low" *)
(* mutually_exclusive = "r_read, r_write, r_clear" *)
(* preempts = "(r1, r2), r3" *)           // r1 和 r2 都可抢占 r3
```

---

## descending_urgency — 紧急性排序

**用途**：当规则之间有冲突时，指定紧急性（urgency）。紧急性高的规则优先执行。

> ⚠️ `descending_urgency` 规定的是**紧急性**排序，不是硬性的逻辑执行顺序。它只在**有冲突**时起作用。如果没有冲突，即使标注了也不影响并行执行。

```bsv
// 例：y2x 紧急性高于 x2y
(* descending_urgency = "y2x, x2y" *)

rule x2y (cnt % 2 == 0);
    x <= cnt;       // 写 x
    y <= cnt - 1;   // 读 y
endrule

rule y2x (cnt % 2 == 1);
    y <= cnt;       // 写 y
    x <= cnt - 1;   // 读 x
endrule
// 冲突：x2y 写 x 读 y，y2x 读 x 写 y
// descending_urgency 确保 y2x 在 x2y 之前
```

---

## mutually_exclusive vs conflict_free（核心区别）

这是 G0004 实验翻车的根本原因——**用错了注解**。

### mutually_exclusive（互斥）

**定义**：两个规则**永远不会同时激活**（guard 互斥）。

```bsv
(* mutually_exclusive = "test1, test2" *)
```

> ⚠️ **必须真正互斥**：如果两个规则实际上可能同时激活，用 `mutually_exclusive` 会导致仿真时 Runtime Error。

### conflict_free（无冲突 = 更安全的互斥）

**定义**：两个规则**可以同时激活**，但它们之间**没有调度冲突**（访问的是不同资源）。

```bsv
(* conflict_free = "test1, test2" *)
```

> ✅ `conflict_free` 不会报 Runtime Error，即使两个规则同时激活。

### 如何选择

| 场景 | 用 |
|------|-----|
| 读/写不同寄存器 | `conflict_free` |
| 读同一个 FIFO（`notEmpty` 互斥）| `mutually_exclusive` |
| 多个 Slave 适配器（同一周期可能多个 stb 有效）| `conflict_free` |
| 状态机不同状态分支 | `mutually_exclusive` |

> 🎯 **实验教训**：Top 层的多个 Slave 适配器规则，同一周期可能多个 Slave 有请求（非互斥），应该用 `conflict_free`，不能用 `mutually_exclusive`。

---

## preempts — 抢占

**用途**：强制两个规则产生冲突，并同时指定紧急性。比单独用 `descending_urgency` 更直接。

```bsv
// r1 抢占 r2
(* preempts = "r1, r2" *)

// 多个抢占者
(* preempts = "(divide3, divide2), other" *)
// 等价于：
// (* preempts = "divide3, other" *)
// (* preempts = "divide2, other" *)
```

> ⚠️ `preempts` 不具有传递性。`descending_urgency` 具有传递性。

### preempts vs descending_urgency

| | `descending_urgency` | `preempts` |
|---|---|---|
| 作用条件 | 有冲突时才生效 | **强制制造冲突**并指定紧急性 |
| 传递性 | ✅ 有 | ❌ 无 |
| 适用场景 | 自然产生的资源冲突 | 需要强行排序的规则 |

---

## Top 集成最佳实践

### 问题：G0004 — 多个 Connect 规则冲突

Top 层中多个 Slave 适配器规则同时调用 Bus 模块的方法 → 编译器报 G0004。

### 正确方案（按推荐顺序）

**方案 1：拆 `_req` / `_resp` 对 + `descending_urgency`**（最保险）

```bsv
// 每对 Slave 拆两条：一条 request，一条 response
(* descending_urgency = "connect_s0_req, connect_s0_resp" *)
rule connect_s0_req;
    rom.request(wb.s0_addr, wb.s0_stb, wb.s0_we, wb.s0_wdata);
endrule
rule connect_s0_resp;
    wb.s0_response(rom.rdata, rom.ack);
endrule

(* mutually_exclusive = "connect_s0_req, connect_s1_req, connect_s2_req, connect_s3_req" *)
```

**方案 2：合并规则 + `conflict_free`**（最简洁）

```bsv
(* conflict_free = "connect_s0, connect_s1, connect_s2, connect_s3" *)
```

**方案 3：子模块自带总线适配器**（最终形态，适合大型项目）

将 `request`/`response` 逻辑封装在每个子模块中，Top 层只负责连接。

### 常见错误

```
❌ (* mutually_exclusive = "connect_s0, connect_s1" *)
   → 多个 Slave 可能同时有请求 → 不是真正互斥 → Runtime Error

❌ 5 条独立规则无任何注解
   → BSC 无法确定顺序 → G0004
```

---

## 调度问题排查

### G0004 — 规则内并行写冲突

| 现象 | 原因 | 解决 |
|------|------|------|
| "uses methods that conflict in parallel" | 同一规则内两次 `<=` 同一寄存器 | 合并写或拆分规则 |
| Top 层多 Connect 规则 | 多条规则同时调 Bus 方法 | 拆 _req/_resp 对或加 `conflict_free` |

### G0010 / G0036 — 跨规则调度冲突

| 现象 | 原因 | 解决 |
|------|------|------|
| "treated as more urgent" | 外部 method 写入 + 内部 rule 读取 | `descending_urgency` |
| "will appear to fire before" | 两条规则写同一寄存器 | 用 `descending_urgency` 排序 |
