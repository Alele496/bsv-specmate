package TrapP0022;

interface TestIFC;
    method Action send(Bit#(8) data);
endinterface

(* synthesize *)
module mkTrapP0022(TestIFC);
    Reg#(Bit#(8)) tx_reg <- mkReg(0);

    // ❌ P0022: pragma form on module method implementation
    (* always_enabled *)
    method Action send(Bit#(8) data);
        tx_reg <= data;
    endmethod
endmodule

endpackage
