# method-2: value method 用 = 而非 if-return

> 适用 BSC 版本: 2025.07

## 现象

Value method 中使用 `= if () return ... else return ...` 语法，触发 P0030。

## 原因

BSV value method 有两种合法写法：
1. `method Type name = expression;` — 纯组合表达式（推荐）
2. `method Type name; ... endmethod` — 带代码块（但内部不能用 return 语句）

将第一种语法（`= expression`）与第二种语法的内容（`if...return`）混合使用，BSC parser 将其识别为 action block，与 value method 声明冲突。

## 解决方案

Value method 用三元表达式替代 if-return：

```bsv
// 错误 — = 后跟 if-return
method Bit#(1) is_done = if (state == DONE) return 1'd1; else return 1'd0;  // P0030

// 正确 — 用三元表达式
method Bit#(1) is_done = (state == DONE) ? 1'd1 : 1'd0;
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
- errorCode: P0030
