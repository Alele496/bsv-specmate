// Correct: tagged construction with data argument
package TrapUnion1Pass;

typedef union tagged {
    Bit#(8) Valid;
    void Invalid;
} Result deriving(Bits, Eq);

interface TestIFC;
    method Result get();
endinterface

(* synthesize *)
module mkTrapUnion1Pass(TestIFC);
    // correct: tagged Valid with explicit data value
    Result r = tagged Valid 8'h42;

    method Result get() = r;
endmodule

endpackage
