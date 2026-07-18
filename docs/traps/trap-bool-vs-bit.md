# trap-bool-vs-bit — Bool 与 Bit#(1) 选型与 interface 兼容性

> 一句话：bsc 2025.07 类型检查已加强（! 对 Bit#(1) → T0020），但选错类型仍导致 interface 集成问题。硬件信号用 Bit#(1)，仅纯逻辑中间变量用 Bool。
> 严重度：quality | bsc感知：部分感知（操作符类型不匹配报 T0020） | 阶段：both

## 为什么这是陷阱

BSV 从 Haskell 继承了 Bool 类型作为纯逻辑类型，但硬件信号是 Bit#(1)。两者的语义不同：

- `!` 逻辑 NOT → 期望 Bool，对 Bit#(1) 报 T0020（bsc 2025.07 已加强）
- `~` 按位 NOT → 期望 Bit#(n)，对 Bool 报 T0020
- `&&`/`||` → 期望同类型，混用报 T0020
- `&`/`|` → 按位操作，期望 Bit#(n)

**bsc 2025.07 的类型检查器已能捕获绝大多数操作符混用情况**——`!` 对 Bit#(1)、`~` 对 Bool、`&&` 混用均报 T0020。这使得该陷阱从"静默错误"降级为"类型选择错误"。

**剩余风险**：内部信号选 Bool → 被迫在 interface method 中用 Bool → 下游无法将 Bool 信号拼入 status bus → 代码大面积重构。

## 正确模式

```bsv
// ❌ 错误写法：内部信号用 Bool → interface 被迫用 Bool
Bool valid = (state == TX);
// 下游使用：{valid, ready, ...} → T0061: Bool 不能位拼接

// ✅ 正确写法：硬件信号一律用 Bit#(1)
Bit#(1) valid = (state == TX) ? 1'd1 : 1'd0;
// 或: Bit#(1) valid = pack(state == TX);  // 显式转换
// 下游使用：{valid, ready, data} → 正常工作

// ✅ 纯逻辑判断（不进入 interface）可以用 Bool
Bool is_tx = (state == TX);    // 仅在 if(is_tx) 等条件中使用
// is_tx 不暴露给 interface，不需要位拼接 → Bool 安全
```

## BSC 参考

- BSV LRM §3.1 类型系统
- BSC Libraries Reference §Bit, §Bool

## 实际案例

Bench 实验中 Agent 频繁混用 Bool/Bit#(1)。bsc 2025.07 的类型检查器捕获了操作符混用（T0020），但类型选型错误（内部用 Bool 导致 interface 用 Bool）仍导致集成时的 T0061 位拼接错误。

## 关联陷阱

- trap-interface-bool — Interface method 返回/参数用 Bool（下游集成问题）
