package TrapG0053;

// G0053 fixture: mkReg 用动态表达式（非编译期常量）
// Wire#(Bit#(1)) w <- mkWire → mkReg(w) → w 是动态信号
// BSC 要求 mkReg 的初始值是编译期静态常量
//
// 断言: mkReg(wire_value) 中 wire_value 不是编译期常量时，
// BSC 报 G0053（动态表达式不能用于子模块实例化参数）。

(* synthesize *)
module mkTrapG0053(Empty);
    Wire#(Bit#(1)) w <- mkWire;

    // G0053: mkReg with dynamic Wire value (not compile-time constant)
    Reg#(Bit#(1)) r <- mkReg(w);
endmodule

endpackage
