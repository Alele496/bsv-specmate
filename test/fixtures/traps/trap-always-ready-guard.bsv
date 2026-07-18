package TrapAlwaysReadyGuard;

// Semantic trap test: interface declares (* always_ready *) but
// implementation has implicit condition (submodule method call)
// Does bsc catch the contradiction?

import FIFO::*;

interface ValIFC;
    (* always_ready *) method Bit#(8) val();
endinterface

module mkValWithFIFO(ValIFC);
    FIFO#(Bit#(8)) fifo <- mkFIFO;

    // fifo.first() propagates notEmpty condition → contradicts always_ready
    method Bit#(8) val();
        return fifo.first();
    endmethod
endmodule

(* synthesize *)
module mkTrapAlwaysReadyGuard(Empty);
    ValIFC v <- mkValWithFIFO;
    Reg#(Bit#(8)) out <- mkReg(0);
    rule tick;
        out <= v.val();
    endrule
endmodule

endpackage
