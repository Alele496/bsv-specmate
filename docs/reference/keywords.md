# BSV 关键字速查

> BSV (Bluespec SystemVerilog) 关键字。编写代码时注意避开这些词的标识符冲突。

## BSV 结构关键字

| 关键字 | 说明 |
|--------|------|
| `module` `endmodule` | 模块定义 |
| `interface` `endinterface` | 接口定义 |
| `rule` `endrule` | 规则定义 |
| `method` `endmethod` | 方法定义 |
| `function` `endfunction` | 函数定义 |
| `package` `endpackage` | 包定义 |
| `import` | 导入包 |
| `export` | 导出成员 |

## BSV 控制流

| 关键字 | 说明 |
|--------|------|
| `if` `else` | 条件分支 |
| `case` `endcase` | 多路分支 |
| `action` `endaction` | 动作块 |
| `begin` `end` | 语句块 |
| `let` | 类型推断绑定 |
| `return` | 函数返回值 |
| `when` | 方法 guard 条件 |
| `matches` | 模式匹配（`tagged Valid .v`） |

## BSV 类型系统

| 关键字 | 说明 |
|--------|------|
| `type` | 类型别名 |
| `typedef` | 类型定义 |
| `enum` | 枚举类型 |
| `struct` | 结构体 |
| `union` | 带标签联合体 |
| `tagged` | 联合体构造器 |
| `deriving` | 自动推导实例（Bits, Eq, FShow） |
| `provisos` | 模块类型约束 |

## BSV 字面值与类型

| 关键字/标识 | 说明 |
|------------|------|
| `True` `False` | 布尔字面值 |
| `Bit#(n)` | n 位向量类型（如 `Bit#(8)`） |
| `Bo ol` | 布尔类型 |
| `Integer` | 编译期整数 |
| `Int#(n)` | n 位有符号整数 |
| `UInt#(n)` | n 位无符号整数 |

## SystemVerilog 保留字（BSV 禁止做标识符）

下列 SV 关键字在 BSV 编译时会检查冲突，**不可**用作变量名、方法名、参数名：

```
action   always   assign   begin   bit      byte
case     class    default  end     endcase  function
import   initial  inout    input   localparam
module   negedge  output   package parameter posedge
priority reg      specify  wire
```

> 曾误用：`action`（struct 字段）、`bit`（方法参数）、`byte`（变量）、`priority`（寄存器）。详见 `lookup_error("P0005")`。

## 常见混淆

| 你以为安全... | 实际不安全原因 |
|-------------|--------------|
| `action` | BSV 关键字 |
| `bit` `byte` `reg` `wire` | SV 保留字 |
| `priority` | SV 3.0 关键字 |
| 大写 `ACT_*` 常量 | 大写 = 类型名语义，应驼峰 |
