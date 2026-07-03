# 常见语法模式与陷阱

> 官方参考用例库：`examples/bsv/`（BSC 测试套件，4,570 个 .bsv 文件）
>
> 旧语法：`examples/bs/`（Bluespec Classic，仅供参考）

## 位拼接

```bsv
Bit#(8)  cmd   = 8'hA5;
Bit#(2)  flag  = 2'b10;
Bit#(14) frame = {cmd, flag, 4'b0000};   // 8+2+4 = 14 位
// 注意：拼接总位宽必须与目标匹配 (T0060)
```

## 字面量

```bsv
8'hFF        // 8 位十六进制
8'b10101010  // 8 位二进制
8'd255       // 8 位十进制
'hFF         // 未指定位宽（编译期推断）
42           // Integer 类型（compile-time）
3.14         // Real 类型
```

`'h` 的优势：不强制位宽，由上下文推断。当修改寄存器位宽时，无需逐条修改字面量。

```bsv
Reg#(Bit#(32)) r <- mkReg(0);
r <= 'hFFFF;          // 自动 32 位

// vs
r <= 32'h0000FFFF;    // 每次改位宽都需手动修改
```

## Case 语句

```bsv
// 用 matches 做模式匹配
case (result) matches
    tagged Valid .v: // 使用 v
    tagged Invalid:  // 无值
endcase
```

## let 关键字

```bsv
// 推断类型，减少手工指定
let x = 42;             // x: Bit#(6) 或 Integer（取决于上下文）
let fifo <- mkFIFOF;    // 推断 Module 类型
let v = fifo.first;     // 返回 Element 类型
```

## 函数 vs 组合逻辑

```bsv
// 纯函数（编译期求值）
function Bit#(8) add(Bit#(8) a, Bit#(8) b);
    return a + b;
endfunction

// 模块内组合逻辑（always 求值）
wire = expr;           // 或 let r = expr; (在 module 内)
```

## 常见 BSV 语法陷阱

### 1. `=` vs `<=` 赋值

```bsv
Reg#(Bit#(8)) r <- mkReg(0);
r <= 42;               // 寄存器赋值用 <=
// r = 42;             // 错误！= 是 let 绑定，不是赋值
```

### 2. 表达式末尾分号

```bsv
// modules 不需要分号
module mkFoo(Foo);
endmodule               // 无分号

// interfaces 不需要分号
interface Foo;
endinterface

// methods 不需要分号
method read = reg;      // 无分号
```

### 3. `begin...end` 块

```bsv
// 单语句可选
if (cond) x <= 1;

// 多语句必须加 begin...end
if (cond) begin
    x <= 1;
    y <= 2;
end

// rule 的 begin...end 是隐式的
rule rl;
    x <= 1;             // 无 begin/end 也行
    y <= 2;
endrule
```

### 4. provisos (类型约束)

```bsv
module mkFoo (FIFOF#(t))
   provisos (Bits#(t, sizet),   // t 必须可 pack 为 bits
             Eq#(t));            // t 必须可比较
```

## 搜索示例库

```sh
# 搜索 FIFO 相关用法
rg "FIFO" examples/bsv/ -l

# 搜索 rule 调度标注
rg "descending_urgency" examples/bsv/ -l

# 搜索特定类型的用法
rg "Reg#\(Bool\)" examples/bsv/ -l
```
