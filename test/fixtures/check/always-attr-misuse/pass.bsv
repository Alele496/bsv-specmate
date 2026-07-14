// Fixture: checkAlwaysAttrMisuse — pass case
// Methods without guards can use always_ready/enabled correctly.
// Methods with guards correctly do NOT use always_ready/enabled.

interface IfcExample;
    (* always_ready, always_enabled *)
    method Action setCtrl(Bit#(8) ctrl);
    method Action setData(Bit#(32) data) if (writeReady);
    method Bit#(32) getData;
endinterface

(* synthesize *)
module mkExample(IfcExample);
    Reg#(Bit#(8)) ctrlReg <- mkReg(0);
    Reg#(Bit#(32)) dataReg <- mkReg(0);
    Reg#(Bool) writeReadyReg <- mkReg(False);

    rule tick;
        writeReadyReg <= True;
    endrule

    method Action setCtrl(Bit#(8) ctrl);
        ctrlReg <= ctrl;
    endmethod

    method Action setData(Bit#(32) data) if (writeReady);
        dataReg <= data;
    endmethod

    method Bit#(32) getData = dataReg;

endmodule
