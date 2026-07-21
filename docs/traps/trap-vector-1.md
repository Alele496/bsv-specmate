# vector-1: vec() 已移除，用 genWith 或 replicateM 构造 Vector

> 适用 BSC 版本: 2025.07

## 现象

使用 `vec(element1, element2, ...)` 构造 Vector 时触发 T0004：`vec` 未绑定。

## 原因

旧版 BSC 标准库曾导出 `vec()` 函数用于便捷构造 Vector。BSC 2025.07 的重构中移除了该函数。Agent 的训练数据可能包含大量旧版 BSV 代码示例，直接使用 `vec()` 触发 T0004。

## 解决方案

使用 `replicateM` 或 `genWith` 替代：

```bsv
// 错误 — vec() 不可用
Vector#(4, Reg#(Bit#(32))) regs <- vec(
    mkReg(0), mkReg(0), mkReg(0), mkReg(0)
);

// 正确 — replicateM（纯模块复制，每个元素相同构造函数）
Vector#(4, Reg#(Bit#(32))) regs <- replicateM(mkReg(0));

// 正确 — genWith + 索引相关初始化
Vector#(8, Bit#(3)) ports = genWith(fromInteger);
// ports[0]=0, ports[1]=1, ..., ports[7]=7

// 正确 — 显式数组（少量元素）
Bit#(3) ports_arr[8] = '{3'd0, 3'd1, 3'd2, 3'd3,
                          3'd4, 3'd5, 3'd6, 3'd7};
Vector#(8, Bit#(3)) ports = vecToVector(ports_arr);
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: T0004
