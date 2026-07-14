// Fixture: checkInterfaceBoolReturn — pass case
// Interface methods use Bit#(1) for hardware signals.

interface IfcExample;
    method Bit#(1) isReady;
    method Action setValue(Bit#(8) val);
    method Bit#(8) getValue;
endinterface

(* synthesize *)
module mkExample(IfcExample);
    Reg#(Bit#(1)) ready <- mkReg(0);
    Reg#(Bit#(8)) value <- mkReg(0);

    method Bit#(1) isReady = ready;
    method Action setValue(Bit#(8) val) = value._write(val);
    method Bit#(8) getValue = value;

endmodule
