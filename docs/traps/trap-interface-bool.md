# trap-interface-bool — Interface method 返回/参数用 Bool

> 一句话：interface method 用 Bool 编译通过，但下游模块无法将 Bool 信号拼入 status bus、无法从 Bus 提取，成为集成瓶颈。
> 严重度：quality | bsc感知：不报错 | 阶段：design

## 为什么这是陷阱

BSV 的类型系统允许 interface method 使用 Bool 作为返回类型或参数类型。单独看一个模块，Bool 方法可以正常编译、正常连线。但当多个模块集成时：

1. **无法位拼接**：`{method_a_return, method_b_return}` 如果其中一个是 Bool，编译报错 T0061（Bool 不能位拼接）
2. **无法从 Bus 提取**：`bus[0]` 返回 Bit#(1)，不能直接赋给 Bool 类型的变量
3. **统一性差**：一个子系统用了 Bool，其他模块必须额外做 pack/unpack 转换

BSC 标准库的接口定义（如 FIFO 的 `notFull`/`notEmpty`）全部使用 Bit#(1)，而非 Bool——这是有意的设计选择。

## 错误表现

### 编译通过但行为错误

单个模块编译无问题。问题暴露在下游集成时：
- 需要把多个状态信号拼成 status bus 时报 T0061
- 需要从配置寄存器中提取某一位作为控制信号时类型不匹配
- 跨模块连线时被迫插入 pack/unpack 包装，引入不必要的延迟

## 正确模式

```bsv
// ❌ 错误写法
interface MyIP;
    method Bool tx_done();           // interface 用 Bool
    method Bool rx_valid();
    method Action start(Bool enable);
endinterface

// ✅ 正确写法：interface method 一律用 Bit#(1)
interface MyIP;
    method Bit#(1) tx_done();        // Bit#(1)
    method Bit#(1) rx_valid();
    method Action start(Bit#(1) enable);
endinterface

// 模块内部可做 Bool ↔ Bit#(1) 转换（如果需要纯逻辑判断）
module mkMyIP(MyIP);
    Bool is_done = (state == DONE);
    method Bit#(1) tx_done = pack(is_done);  // 内部转换
endmodule
```

## BSC 参考

- BSC Libraries Reference §FIFO interface 定义（`notFull`/`notEmpty` 全部用 Bit#(1)）

## 实际案例

1. 07-14 危机分析盲区：interface 用 Bool 的问题在当时未被任何检查工具覆盖，直到 `check_style.mjs` 新增 `checkInterfaceBoolReturn` 规则才补齐。

2. 03-axistream bench 实验：Agent B 的 interface 全部用 Bool（如 `method Bool tvalid()`），单独编译通过，但在集成到 AXI 总线子系统时，Bool 信号需要与其他 Bit#(1) 信号拼接进 status register，导致大范围重构。

## 关联陷阱

- trap-bool-vs-bit — Bool 与 Bit#(1) 操作符混用（操作符层面的混用问题）
