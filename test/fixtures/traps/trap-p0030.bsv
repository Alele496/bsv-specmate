package TrapP0030;

interface TestIFC;
    method Bit#(1) tx;
endinterface

(* synthesize *)
module mkTrapP0030(TestIFC);
    Reg#(Bool) tx_busy <- mkReg(False);

    method Bit#(1) tx;
        if (!tx_busy) return 1'd1;
        return 1'd0;
    endmethod
endmodule

endpackage
