// Fixture: checkAlwaysAttrMisuse — fail case
// Methods with guards incorrectly marked always_ready/enabled — should be detected.

interface IfcExample;
    (* always_ready, always_enabled *)
    method Action setData(Bit#(32) data) if (writeReady);
    (* always_ready *)
    method Bit#(32) getData;
endinterface

(* synthesize *)
module mkExample(IfcExample);
    Reg#(Bit#(32)) dataReg <- mkReg(0);
    Reg#(Bool) writeReadyReg <- mkReg(False);

    rule tick;
        writeReadyReg <= True;
    endrule

    method Action setData(Bit#(32) data) if (writeReady);
        dataReg <= data;
    endmethod

    method Bit#(32) getData = dataReg;

endmodule
