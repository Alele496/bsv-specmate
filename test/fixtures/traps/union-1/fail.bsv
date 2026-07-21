// Expected error: T0144 — tagged construction missing data argument
package TrapUnion1Fail;

typedef union tagged {
    Bit#(8) Valid;
    void Invalid;
} Result deriving(Bits, Eq);

interface TestIFC;
    method Result get();
endinterface

(* synthesize *)
module mkTrapUnion1Fail(TestIFC);
    // T0144: tagged Valid without data argument
    Result r = tagged Valid;

    method Result get() = r;
endmodule

endpackage
