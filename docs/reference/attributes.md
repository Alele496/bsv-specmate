# BSV 属性语法

BSV 使用 `(* ... *)` 语法标注编译器指令。属性放在被修饰对象（module、rule、method、function）之前。

## 常用属性

| 属性 | 用途 | 位置 |
|------|------|------|
| `synthesize` | 标记顶层模块可综合 | module |
| `descending_urgency` | 指定规则执行优先级顺序 | module/rule |
| `execution_order` | 指定规则执行顺序 | module |
| `preempts` | 规则抢占声明 | module |
| `noinline` | 禁止内联优化 | function |
| `always_ready` | 声明 method 始终就绪 | interface method |
| `always_enabled` | 声明 method 始终使能 | interface method |
| `fire_when_enabled` | 规则在使能时自动触发 | rule |
| `result` | 指定 BVI method 输出结果 | BVI method |

## 常见错误

### P0085 — 属性重复
```
(* synthesize, synthesize *)   // 错误：重复
(* synthesize=1, synthesize=0 *)  // 错误：值为数字，不需要 =1
(* fire_when_enabled=1, fire_when_enabled=0 *)  // 错误：重复 + 不需要 =1
```
**修复**：每个属性只出现一次，`synthesize` 不需要值。

### P0085 — 属性拼写错误
```
(* synthesized *)  // 错误：应为 synthesize
```
**修复**：`synthesized` → `synthesize`

### G0054 — 属性引用的规则不存在
```
(* descending_urgency = "nonexistent_rule, real_rule" *)
```
**修复**：确保所有引用的规则名都在当前模块中声明。

### G0030 — urgency 循环
```
(* descending_urgency = "A, B" *)
(* descending_urgency = "B, A" *)  // 循环！
```
**修复**：检查所有 descending_urgency，确保不形成环。

### G0040 — urgency 自引用
```
(* descending_urgency = "r1, r1" *)  // 自引用
```
**修复**：不要在同一组内重复同一规则名。

## 属性语法规则

- `(* synthesize *)` — 正确，不需要值
- `(* fire_when_enabled *)` — 正确，设 flag 不需要 `=1`
- `(* always_ready = "method1, method2" *)` — 带字符串值，用引号
- `(* noinline *)` — 正确
- 多个属性用逗号分隔：`(* synthesize, noinline *)`
