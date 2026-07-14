// Fixture: checkInterfaceBoolReturn — fail case
// Interface methods return Bool instead of Bit#(1) — should be detected.

interface IfcExample;
    method Bool isReady;
    method Action setValue(Bit#(8) val);
    method Bool getAck;
endinterface

(* synthesize *)
module mkExample(IfcExample);
    Reg#(Bool) ready <- mkReg(False);
    Reg#(Bit#(8)) value <- mkReg(0);
    Reg#(Bool) ack <- mkReg(False);

    method Bool isReady = ready;
    method Action setValue(Bit#(8) val) = value._write(val);
    method Bool getAck = ack;

endmodule
