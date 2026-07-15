// Fixture: checkSynthesizeAnnotationOrder — fail case
// Urgency annotation placed inside module body AFTER (* synthesize *)
// — creates scheduling boundary, G0010 may not be eliminated.

interface IfcBridge;
    method Action setFlag;
    method Bit#(8) getData;
endinterface

(* synthesize *)
module mkBridgeFail(IfcBridge);
    Reg#(Bit#(8)) data <- mkReg(0);
    Reg#(Bit#(1)) flag <- mkReg(0);

    // Urgency AFTER synthesize inside module body — may not work for method/rule conflicts
    (* descending_urgency = "setFlag, process_rule" *)

    rule process_rule;
        data <= data + 1;
    endrule

    method Action setFlag;
        flag <= 1;
    endmethod

    method Bit#(8) getData = data;
endmodule
