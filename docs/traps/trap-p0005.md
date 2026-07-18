# trap-p0005 — P0005: function 是 Verilog-2001 保留字

> 一句话：BSV 模块内的 `function` 关键字与 Verilog-2001 保留字冲突，genWith/map/fold 的回调绝对不可写 `function(...)` 语法。
> 严重度：hard | bsc感知：报错 | 阶段：code

## 为什么这是陷阱

BSV 编译器在生成 Verilog 时使用 Verilog-2001 模式（V2K）。在 Verilog-2001 标准中，`function` 是保留关键字。当你在 BSV 模块内写 `genWith(function(Integer i); ... endfunction)` 时，BSC 生成的 Verilog 中会出现 `function` 关键字，与 V2K 保留字冲突，直接报错。

这本质上是 BSV → Verilog 的跨语言关键字冲突——不是 BSV 语法问题，是生成目标语言的限制。Agent 训练数据中可能包含旧版 BSC 教材中的 `function(...)` 语法，而这些教材没有说明 V2K 兼容性问题。

## 错误表现

### bsc 报错

```
Error: "./MyModule.bsv", line 35, column 12: (P0005)
  Unexpected keyword `function'; expected "expression", "end", or other
  The keyword `function` is a Verilog-2001 reserved word and cannot be used
  inside a module body in this context.
```

## 正确模式

```bsv
// ❌ 错误写法
Vector#(8, Bit#(3)) result = genWith(function(Integer i);
    return requests[i];
endfunction);

// ✅ 正确写法 1：部分应用（推荐）
Vector#(8, Bit#(3)) result = genWith(requests, \== (1));

// ✅ 正确写法 2：将逻辑提取到模块外的独立 function
function Bit#(3) getRequest(Integer i);
    return requests[i];
endfunction
// ... 模块内:
Vector#(8, Bit#(3)) result = genWith(getRequest);

// ✅ 正确写法 3：replicateM（不需要回调时）
Vector#(8, Reg#(Bit#(32))) regs <- replicateM(mkReg(0));
```

## BSC 参考

- BSC User Guide §7.3.2 "Verilog-2001 Keywords"
- BSV LRM §3.1 类型系统

## 实际案例

04-priority-encoder Round 3：Agent A 和 Agent B 均写了 `genWith(function(Integer i); return requests[i]; endfunction)`，触发 P0005。虽然 specmate 的 UNIVERSAL_TRAPS 中已有 P0005 警告，但当时文案太抽象（只说"不用 function 关键字"，未给出具体错误代码对比），Agent 看过后仍然写错。

## 关联陷阱

- trap-p0030 — P0030: Value method 中非尾位置 return
- trap-p0022 — P0022: Module method 实现用 pragma 而非 suffix
- trap-vec-construction — vec() 已移除，用 genWith 构造 Vector
