// Expected error: G0004 — same register written twice in one rule
package TrapRule1Fail;

interface TestIFC;
    method Bit#(8) val();
endinterface

(* synthesize *)
module mkTrapRule1Fail(TestIFC);
    Reg#(Bit#(8)) count <- mkReg(0);

    rule do_work;
        count <= 1;
        count <= 2;  // G0004: parallel write conflict on count
    endrule

    method Bit#(8) val() = count;
endmodule

endpackage
