# 模块、接口、Rule、Method 语法

## 模块定义

```bsv
module mkFoo(Foo);
    // 状态声明
    Reg#(Bit#(8)) x <- mkReg(0);

    // 所有 rules 在前
    rule rl_do_something;
        x <= x + 1;
    endrule

    // 所有 methods 在后
    method Action put(Bit#(8) val);
        x <= val;
    endmethod

    method Bit#(8) get;
        return x;
    endmethod
endmodule
```

## 接口 (Interface) 定义

```bsv
interface Foo;
    method Action put(Bit#(8) val);
    method Bit#(8) get;
endinterface
```

带 guard 的 method：
```bsv
interface FIFOF #(type t);
    method Action enq(t x) if (notFull);
    method Action deq()    if (notEmpty);
    method t first()       if (notEmpty);
endinterface
```

## Rule 内语法

```bsv
rule rl_example;                    // 不带条件
    // ...
endrule

rule rl_conditional (guard_cond);   // 带条件 guard
    // ...
endrule

(* descending_urgency = "rl_high, rl_low" *)  // urgency 标注
(* mutually_exclusive = "rl_a, rl_b" *)        // 互斥标注
(* conflict_free = "rl_a, rl_b" *)             // 冲突自由标注
```

## Action vs Value Method

```bsv
// Action method — 可能修改状态
method Action set(Bit#(8) val);
    reg <= val;
endmethod

// Value method — 只读
method Bit#(8) read;
    return reg;
endmethod

// 简写
method read = reg;
```

## 常见导入

```bsv
import FIFO::*;
import FIFOF::*;
import Vector::*;
import RegFile::*;
import GetPut::*;
import ClientServer::*;
import StmtFSM::*;
import BUtils::*;
```
