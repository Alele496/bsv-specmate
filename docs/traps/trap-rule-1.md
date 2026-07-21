# rule-1: 同一 rule 内同一 Reg 只写一次

> 适用 BSC 版本: 2025.07

## 现象

一条 rule 内对同一个寄存器执行两次 `<=` 写入，BSC 触发 G0004 并行写冲突。

## 原因

BSC 调度分析器在 rule 粒度上检查寄存器写冲突。一条 rule 的执行相当于一个硬件 cycle，每个寄存器在一个 cycle 内只能有一个确定的写入值。两次写入意味着并行写入冲突，硬件上不可实现。

## 解决方案

将多次写入合并为一个条件表达式，或拆分为多条 rule。

```bsv
// 错误 — 同一 rule 两次写入
rule do_work;
    count <= 1;
    count <= 2;  // G0004
endrule

// 正确 — 条件表达式合并为单次写入
rule do_work;
    count <= (cond) ? 1 : 2;
endrule
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: G0004
