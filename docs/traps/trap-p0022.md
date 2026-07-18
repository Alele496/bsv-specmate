# trap-p0022 — P0022: Module method 实现用 pragma 而非 suffix

> 一句话：module 内 method 实现不能用 `(* always_enabled *)` pragma 形式——BSC 要求 suffix 关键字形式（`method ... always_enabled;`）。
> 严重度：hard | bsc感知：报错 | 阶段：code

## 为什么这是陷阱

BSV 中 method 属性有两种语法：

1. **Pragma 形式**（`(* attribute *)`）：用于 **interface 声明**
2. **Suffix 形式**（关键字跟在 method 签名后）：用于 **module 内 method 实现**

在 module 的 method 实现处使用 `(* always_enabled *)` pragma 形式，BSC 的 parser 会把 pragma 附着到错误的位置（通常是整个 method 定义而非具体端口），导致编译失败。

Agent 常见错误：在参考文档和教材中看到 pragma 形式的属性标注，然后不加区分地在 interface 声明和 module 实现中都使用 pragma。

## 错误表现

### bsc 报错

```
Error: "./MyModule.bsv", line 56, column 5: (P0022)
  Attribute `always_enabled` is not allowed on a method definition.
  Use suffix form: method Action foo() always_enabled;
  instead of: (* always_enabled *) method Action foo();
```

## 正确模式

```bsv
// ❌ 错误写法：module 内 method 实现用 pragma
module mkMyModule(MyInterface);
    // ...
    (* always_enabled *) method Action send(Bit#(8) data);
        tx_reg <= data;
    endmethod

    (* always_ready *) method Bit#(1) tx_done;
        return done_flag;
    endmethod
endmodule

// ✅ 正确写法：module 内用 suffix 形式
module mkMyModule(MyInterface);
    // ...
    method Action send(Bit#(8) data) always_enabled;  // suffix 形式
        tx_reg <= data;
    endmethod

    method Bit#(1) tx_done() always_ready;             // suffix 形式
        return done_flag;
    endmethod
endmodule

// ✅ interface 声明中可以用 pragma（这是正确的用法）
interface MyInterface;
    (* always_enabled *) method Action send(Bit#(8) data);
    (* always_ready *)   method Bit#(1) tx_done();
endinterface
```

## BSC 参考

- BSC User Guide §5.1 method 属性语法
- BSC User Guide §4.2 "Interface Declarations"

## 实际案例

Agent 在实现 AXI-Stream 接口时，从 BSC 标准库文档复制了 pragma 形式的属性声明，然后在 module 实现中也照搬 pragma 形式。interface 声明编译通过（pragma 合法），但 module 实现处 P0022 报错。Agent 误以为属性不支持，反复尝试去掉属性——导致调度问题。

## 关联陷阱

- trap-p0005 — P0005: function 是 Verilog-2001 保留字（同样涉及 method 实现上的标记错误，但机制不同）
- trap-p0030 — P0030: Value method 中非尾位置 return（method 语法层面）
- trap-always-ready-guard — always_ready/enabled 与 guard 条件矛盾（属性语义层面）
