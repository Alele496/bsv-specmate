// Correct: 优先编码器输出位宽 = ceil(log2(input_width)) = ceil(log2(9)) = 4
package TrapEncoder1Pass;

interface EncoderIFC;
    method Bit#(4) encode(Bit#(9) in);   // CORRECT: 4-bit output covers indices 0-8
endinterface

(* synthesize *)
module mkTrapEncoder1Pass(EncoderIFC);
    // priority encoder for 9-bit input → 4-bit output (ceil(log2(9)) = 4)
    method Bit#(4) encode(Bit#(9) in);
        if (in[8] == 1) return 4'd8;       // CORRECT: index 8 fits in 4 bits (max 15)
        else if (in[7] == 1) return 4'd7;
        else if (in[6] == 1) return 4'd6;
        else if (in[5] == 1) return 4'd5;
        else if (in[4] == 1) return 4'd4;
        else if (in[3] == 1) return 4'd3;
        else if (in[2] == 1) return 4'd2;
        else if (in[1] == 1) return 4'd1;
        else return 4'd0;
    endmethod
endmodule

endpackage
