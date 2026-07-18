package TrapG0004;

// G0004 fixture: 单 rule 内调用同一子模块的两个 Action method
// ctr.inc() 和 ctr.dec() 都写 count 寄存器 → 共享资源冲突
// BSC 无法在单 rule 内并行执行两个冲突的 method → G0004
//
// 断言: 同一子模块实例的两个 Action method 在单 rule 内调用，
// 访问同一个寄存器时，BSC 报 G0004 并行冲突。

interface CounterIFC;
    method Action inc();
    method Action dec();
endinterface

module mkCounter(CounterIFC);
    Reg#(Bit#(8)) count <- mkReg(0);

    method Action inc();
        count <= count + 1;
    endmethod

    method Action dec();
        count <= count - 1;
    endmethod
endmodule

(* synthesize *)
module mkTrapG0004(Empty);
    CounterIFC ctr <- mkCounter;

    rule do_work;
        ctr.inc();  // 写 count
        ctr.dec();  // 也写 count → G0004 并行冲突
    endrule
endmodule

endpackage
