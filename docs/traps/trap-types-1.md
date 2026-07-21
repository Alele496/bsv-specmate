# types-1: Bool 用 ! 不用 ~

> 适用 BSC 版本: 2025.07

## 现象

对 `Bool` 类型使用 `~`（按位取反）触发 T0020 操作符类型不匹配错误。`~` 期望 `Bit#(n)` 操作数。

## 原因

BSV 的类型系统中 `~` 是位级操作符，应用于 `Bit#(n)` 类型（包括 `Bit#(1)`）。`Bool` 是逻辑类型，只能用逻辑操作符 `!`（逻辑 NOT）、`&&`（逻辑 AND）、`||`（逻辑 OR）。对 `Bool` 用按位操作符触发 T0020 类型不匹配。

反之亦然：对 `Bit#(1)` 用 `!` 同样触发 T0020，因为 `!` 期望 `Bool` 操作数。

## 解决方案

始终使用类型对应的操作符：

| 类型 | NOT | AND | OR |
|------|-----|-----|----|
| `Bool` | `!` | `&&` | `||` |
| `Bit#(n)` | `~` | `&` | `|` |

```bsv
// 错误 — ~ 用于 Bool
Bool done = True;
Bool done_inv = ~done;  // T0020

// 正确 — ! 用于 Bool
Bool done = True;
Bool done_inv = !done;

// 错误 — ! 用于 Bit#(1)
Bit#(1) flag = 1'd1;
Bit#(1) flag_inv = !flag;  // T0020

// 正确 — ~ 用于 Bit#(1)
Bit#(1) flag = 1'd1;
Bit#(1) flag_inv = ~flag;
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: T0020
