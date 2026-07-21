// Expected error: T0030 — polymorphic module cannot be directly synthesized
package TrapSynthesize1Fail;

import FIFO :: *;
import FIFOF :: *;

interface TestIFC;
    method Action enq_val(Bit#(32) val);
    method Bit#(32) first();
    method Action deq();
endinterface

// T0030: module with type parameter 't' cannot be (* synthesize *) directly
(* synthesize *)
module mkTrapSynthesize1Fail(FIFOF#(t)) provisos (Bits#(t, sz_t));
    FIFO#(t) f <- mkFIFO;

    method t first() = f.first();
    method Action enq_val(t val) = f.enq(val);
    method Action deq() = f.deq();
endmodule

endpackage
