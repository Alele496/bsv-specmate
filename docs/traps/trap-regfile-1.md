# regfile-1: RegFile 最多 5 读端口

> 适用 BSC 版本: 2025.07

## 现象

使用 `mkRegFile` 并且同时有超过 5 个 `sub` 方法调用时，触发 G0002 调度分析错误。

## 原因

`mkRegFile` 的 `maxReadPorts` 参数硬限制为 5。当模块实例化超过 5 个读端口（通过 `rf.sub(0)` 到 `rf.sub(5)` 等）时，BSC 调度器检测到资源超额分配并报告 G0002。

`mkRegFileFull` 没有此限制，因为它使用不同的内部实现（更多 BRAM 资源但无端口计数限制）。`mkRegFileWCF`（Write Capability FIFO）同样受限。

## 解决方案

根据需求选择正确的构造器：

```bsv
// 错误 — 6 个读端口超出 RegFile 限制
RegFile#(Bit#(5), Bit#(32)) rf <- mkRegFile(0, 31);
// rf.sub(0) ~ rf.sub(5) → G0002: 第 6 个读端口超出限制

// 正确 — 需要更多读端口时用 mkRegFileFull
RegFile#(Bit#(5), Bit#(32)) rf <- mkRegFileFull;
// rf.sub(0) ~ rf.sub(N) — 无端口数量限制

// 正确 — 5 个或以内读端口用 mkRegFile（资源优化）
RegFile#(Bit#(5), Bit#(32)) rf <- mkRegFile(0, 31);
// rf.sub(0) ~ rf.sub(4) — 5 个读端口，正常
```

## 规则

- severity: hard
- phase: design
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: G0002
