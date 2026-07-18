# fsm-2: value method 不用 if-return，用 ?: 三元链

> 适用 BSC 版本: 2025.07

## 现象

在 FSM 相关模块的 value method 中使用 `if-return` 语法，触发 P0030 编译错误：
"Provisional return not in tail position in value method"

## 原因

BSV value method 使用 `= expr` 赋值语法，编译器将整个方法体译为纯组合逻辑。在 `if`/`for` 块中用 `return` 会强制引入 Action 上下文（需要状态变化），导致类型不匹配。

FSM 模块通常有多个 value method 暴露内部状态（如 `get_state`、`get_data`），是新 Agent 最容易踩的坑。

## 解决方案

用 `?:` 三元链替代所有 `if-return` 分支。

```bsv
// 错误 — 触发 P0030
method Bit#(8) result;
    if (state == IDLE) return 0;
    else if (state == BUSY) return data;
    else return 8'hFF;
endmethod

// 正确 — 用 ?: 三元链
method Bit#(8) result =
    (state == IDLE) ? 0 :
    (state == BUSY) ? data :
    8'hFF;
```

## 规则

- severity: hard
- phase: code
- bscDetectable: true
- bscVersions: ['2025.07']
