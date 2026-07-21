// Correct: wrap polymorphic module with concrete type for synthesis
package TrapSynthesize1Pass;

import FIFO :: *;

interface TestIFC;
    method Action enq_val(Bit#(32) val);
    method Bit#(32) first();
    method Action deq();
endinterface

// correct: concrete type wrapper with (* synthesize *)
(* synthesize *)
module mkTrapSynthesize1Pass(TestIFC);
    FIFO#(Bit#(32)) f <- mkFIFO;

    method Bit#(32) first() = f.first();
    method Action enq_val(Bit#(32) val) = f.enq(val);
    method Action deq() = f.deq();
endmodule

endpackage
