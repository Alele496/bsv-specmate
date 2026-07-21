// Correct: 译码器 one-hot 输出位宽 = 2^input_width = 2^3 = 8
package TrapDecoder1Pass;

interface DecoderIFC;
    method Bit#(8) decode(Bit#(3) addr);   // CORRECT: 8-bit output for 3-bit input
endinterface

(* synthesize *)
module mkTrapDecoder1Pass(DecoderIFC);
    integer i;

    method Bit#(8) decode(Bit#(3) addr);
        Bit#(8) result = 0;
        // CORRECT: full 8-bit output covers all 8 addresses (0-7)
        for (i = 0; i < 8; i = i + 1) begin
            if (addr == fromInteger(i))
                result[i] = 1;
        end
        return result;
    endmethod
endmodule

endpackage
