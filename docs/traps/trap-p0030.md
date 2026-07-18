# trap-p0030 — P0030: Value method 中非尾位置 return

> 一句话：BSV value method 只能用 `= expr` 表达式语法，在 if/for/case 块中用 return 会引入 Action 上下文，触发 P0030 类型不匹配。
> 严重度：hard | bsc感知：报错 | 阶段：code

## 为什么这是陷阱

BSV 编译器将 value method 译为纯组合逻辑电路，必须使用 `= expression` 语法。在 method 体内部使用 `if`/`for`/`case` 等控制结构中的 `return` 语句，会让编译器认为你在使用 Action 上下文（需要状态变化），导致类型不匹配。

根本原因：BSV 中 method 有两种——`value method`（组合逻辑，用 `=` 语法）和 `action method`（时序逻辑，用 `Action` 返回类型 + 命令式语法）。如果在 value method 中使用 `return`，编译器把它当成 action block，但方法签名声明的是 value method，类型检查失败。

## 错误表现

### bsc 报错（常见）

```
Error: "./MyModule.bsv", line 42, column 9: (P0030)
  Method `tx` is a value method but uses action syntax (return, action block,
  etc.) in its body. Value methods must use "= expression" syntax.
  Did you mean to declare this as an Action method instead?
```

## 正确模式

```bsv
// ❌ 错误写法
method Bit#(1) tx;
    if (!tx_busy) return 1'd1;
    return 1'd0;
endmethod

// ✅ 正确写法：用三元链代替 if-return
method Bit#(1) tx = (!tx_busy) ? 1'd1 : 1'd0;

// ✅ 另一种正确写法：多个条件用三元链
method Bit#(2) status;
    if (state == IDLE) return 2'd0;
    else if (state == RUN) return 2'd1;
    return 2'd2;
endmethod

// 改为：
method Bit#(2) status = (state == IDLE) ? 2'd0 : (state == RUN) ? 2'd1 : 2'd2;
```

## BSC 参考

- BSC User Guide §4.2 "Value Methods vs Action Methods"

## 实际案例

04-priority-encoder Round 2：Agent B 在 method 内用 if-return 触发 P0030。虽然 Agent B 的整体代码设计比 Agent A 更优雅（用了更正确的模块划分），但 value method 语法错误导致编译失败。案例说明 specmate 的高层设计指导生效了（结构更好），但缺少编译前语法模式检查。

## 关联陷阱

- trap-p0005 — P0005: function 是 Verilog-2001 保留字（同样涉及 method/function 实现上的标记错误，但机制不同）
- trap-p0022 — P0022: Module method 实现用 pragma 而非 suffix
- trap-bool-vs-bit — Bool 与 Bit#(1) 操作符混用（value method 返回类型选错也常见）
