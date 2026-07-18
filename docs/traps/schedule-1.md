# schedule-1: descending_urgency 不循环

> 适用 BSC 版本: 2025.07

## 现象

多个 rule 写同一寄存器时，使用 `descending_urgency` 显式标注优先级。如果标注的 rule 引用关系形成循环（如 `rl_a > rl_b > rl_c > rl_a`），BSC 编译器会拒绝并报调度错误。

## 原因

BSC 调度分析器需要 rule 优先级形成偏序关系（partial order），不能有循环依赖。`descending_urgency` 是线性优先级链：靠前的 rule 优先级高于靠后的，列表中的每个 rule 只出现一次。

## 解决方案

优先级链必须是线性的、不循环的。

```bsv
// 正确 — 线性优先级链：rl_a > rl_b > rl_c，无循环
(* descending_urgency = "rl_a, rl_b, rl_c" *)

rule rl_a;
    ...
endrule

rule rl_b;
    ...
endrule

rule rl_c;
    ...
endrule

// 错误 — 循环优先级（注释示意）
// (* descending_urgency = "rl_a, rl_b, rl_c, rl_a" *)  ← 循环！
```

## 规则

- severity: hard
- phase: design
- bscDetectable: true
- bscVersions: ['2025.07']
