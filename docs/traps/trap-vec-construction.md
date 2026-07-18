# trap-vec-construction — vec() 已移除，用 genWith 构造 Vector

> 一句话：BSC 2025.07 标准库不导出 `vec()` 函数，必须用 `genWith` 或 `replicateM` 构造 Vector。
> 严重度：hard | bsc感知：报错 | 阶段：code

## 为什么这是陷阱

旧版 BSC（2024 及更早）的标准库曾导出 `vec()` 函数用于便捷构造 Vector。BSC 2025.07 的重构中移除了这个函数。但 Agent 的训练数据可能包含大量的旧版 BSV 代码示例和教材，其中频繁使用 `vec(...)` 语法。

当 Agent 尝试写 `vec(mkReg(0), mkReg(0), mkReg(0))` 时，BSC 2025.07 报告 `vec` 未绑定——因为该函数已不在 Prelude 或标准库的导出列表中。

## 错误表现

### bsc 报错

```
Error: "./MyModule.bsv", line 15, column 12: (T0004)
  `vec` is not bound. The function is not exported by the current BSC version.
  Use `genWith` or `replicateM` to construct Vectors.
```

或简化为：

```
Error: (T0004) Unbound variable "vec"
```

## 正确模式

```bsv
// ❌ 错误写法：vec() 函数不存在
Vector#(4, Reg#(Bit#(32))) regs <- vec(
    mkReg(0), mkReg(0), mkReg(0), mkReg(0)
);

// ❌ 另一个错误变体
Vector#(8, Bit#(3)) ports = vec(3'd0, 3'd1, 3'd2, 3'd3,
                                 3'd4, 3'd5, 3'd6, 3'd7);

// ✅ 正确写法 1：genWith（模块实例化）
Vector#(4, Reg#(Bit#(32))) regs <- genWith(vec, mkReg(0));
// genWith 为每个索引 i 调用 mkReg(0)，返回 4 个独立寄存器

// ✅ 正确写法 2：replicateM（纯模块复制）
Vector#(4, Reg#(Bit#(32))) regs <- replicateM(mkReg(0));

// ✅ 正确写法 3：genWith + 索引相关初始化（不同值）
Vector#(8, Bit#(3)) ports = genWith(vec, fromInteger);
// ports[0]=0, ports[1]=1, ..., ports[7]=7

// ✅ 正确写法 4：显式数组（固定少量元素）
Bit#(3) ports_arr[8] = '{3'd0, 3'd1, 3'd2, 3'd3,
                          3'd4, 3'd5, 3'd6, 3'd7};
Vector#(8, Bit#(3)) ports = vecToVector(ports_arr);
```

## BSC 参考

- BSC 2025.07 CHANGES（vec 函数移除公告）
- BSC Libraries Reference §Vector

## 实际案例

Bench 实验中 Agent 尝试 `vec(mkReg(0), mkReg(0))` 构造寄存器数组，触发 T0004。Agent 的解决方案是切换为 `genWith`。但由于 Agent 的训练数据中 `vec()` 出现频率很高（旧教材中广泛使用），每次遇到 Vector 构造时都会优先尝试 `vec()`。

## 关联陷阱

- trap-p0005 — P0005: function 是 Verilog-2001 保留字（genWith 的回调不能写 function 关键字）
