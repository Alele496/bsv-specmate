# arbiter-1: 同一 cycle 超 5 读端口 → G0002

> 适用 BSC 版本: 2025.07

## 现象

当一条 rule 在同一 cycle 内通过方法调用访问同一 Register 模块超过 5 次读取，BSC 触发 G0002：
"register read port limit exceeded — method is called with too many read ports"

## 原因

BSC 的规则分析器对单个 Register 模块的读端口有限制：最多 5 个读端口。超出后 BSC 无法在硬件中映射（FPGA 上 register file 通常仅支持 5 个同步读端口）。

## 解决方案

限制单 cycle 内的读取次数不超过 5，或使用多个 regfile 实例分担读压力。

```bsv
// 正确 — 单 cycle 最多 3 个读端口（安全）
rule do_read;
    let a = rf.sub(addr);     // 读 1
    let b = rf.sub(addr + 1); // 读 2
    let c = rf.sub(addr + 2); // 读 3 — 总计 3 个读端口 ✓
endrule

// 错误 — 单 cycle 6 个读端口 → G0002
// rule do_read;
//     let a = rf.sub(addr);     // 读 1
//     let b = rf.sub(addr+1);   // 读 2
//     ...
//     let f = rf.sub(addr+5);   // 读 6 → G0002!
// endrule
```

## 规则

- severity: hard
- phase: design
- bscDetectable: true
- bscVersions: ['2025.07']
