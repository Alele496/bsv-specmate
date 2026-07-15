// Fixture: checkSynthesizeAnnotationOrder — pass case
// Urgency annotation is placed BEFORE (* synthesize *) as module-level attribute.

interface IfcBridge;
    method Action setFlag;
    method Bit#(8) getData;
endinterface

// Correct: urgency before synthesize as module-level attributes
(* descending_urgency = "setFlag, process_rule" *)
(* synthesize *)
module mkBridgePass(IfcBridge);
    Reg#(Bit#(8)) data <- mkReg(0);
    Reg#(Bit#(1)) flag <- mkReg(0);

    rule process_rule;
        data <= data + 1;
    endrule

    method Action setFlag;
        flag <= 1;
    endmethod

    method Bit#(8) getData = data;
endmodule
