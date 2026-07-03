# BSV 编码规范

> **环境**: Bluespec Compiler, version 2025.07
>
> 本文档记录 BSV 语法规则和编码约定。编译错误记录见 `docs/errors/`。

---

## 模块结构

每个模块内：**所有 rule 在前，所有 method 在后。中间不能交替。**

```bsv
module mkFoo(Foo);
    // 状态声明
    Reg#(Bit#(8)) x <- mkReg(0);

    // 所有 rule
    rule rl_a; ... endrule
    rule rl_b; ... endrule

    // 所有 method (Action + value method)
    method Action put(...); ... endmethod
    method get = ...;
endmodule
```

> 详细错误：见 `docs/errors/P0032.md`

---

## 标识符命名

所有标识符用小写或驼峰。**避免以下 SystemVerilog 保留字：**

`action` `bit` `byte` `reg` `wire` `module` `input` `output` `inout` `assign` `always` `initial` `posedge` `negedge` `case` `default` `endcase` `end` `begin` `function` `task` `specify` `primitive`

Package 常量也用小写驼峰，不用大写 `ACT_*`（BSV 视大写为类型名语义）。

> 详细错误：见 `docs/errors/P0005.md`

---

## 类型系统

### Bool vs Bit#(n)

| | Bool | Bit#(n) |
|---|------|---------|
| 操作符 | `!` `&&` `\|\|` `==` `!=` | `~` `&` `\|` `^` `==` `!=` |
| 用途 | 逻辑条件 | 数据运算 |
| 位位宽 | 无 | 有 `Bit#(1)` ~ `Bit#(n)` |

**Bool 不能用位操作符。** 位操作符仅用于 `Bit#(n)`。

> 详细错误：见 `docs/errors/T0061.md`

### 位宽匹配

拼接表达式 `{a, b, c}` 的总位宽必须与赋值目标一致。扩大寄存器位宽时，所有与之比较/运算的相关寄存器一起扩宽。

> 详细错误：见 `docs/errors/T0060.md`、`T0051.md`

---

## Rule 调度

### 单 rule 内

同一 rule 内每个寄存器只能在一个无条件路径上被写入。`case ... default` 中若写入与其他路径相同的寄存器，触发 G0004 冲突。

> 详细错误：见 `docs/errors/G0004.md`

### 跨 rule

- 跨 rule 传递触发+数据：用 `FIFOF`，不用 `PulseWire + Reg`
- 跨模块 method 与内部 rule 互斥：加 `(* descending_urgency *)` 显式标注

> 详细错误：见 `docs/errors/G0010.md`

---

## Verilog 生成

- `method Action` 的 Verilog 端口名 = 参数名（非方法名）
- 额外生成 `EN_<方法名>`（输入使能）、`RDY_<方法名>`（输出就绪）
- Vivado 用时创建 `top_wrapper.v` 薄封装

> 详细说明：见 `docs/errors/BSV-PORTS.md`
