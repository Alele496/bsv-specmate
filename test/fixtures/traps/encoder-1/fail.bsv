// Expected issue: encoder-1 — 优先编码器输出位宽不足，编码结果截断
// 这是设计级陷阱：代码可正常编译，但 9-bit 输入用 3-bit 输出导致高位索引丢失
// ceil(log2(9)) = 4 bits needed, only 3 provided
package TrapEncoder1Fail;

interface EncoderIFC;
    method Bit#(3) encode(Bit#(9) in);   // BUG: 输出位宽不足
endinterface

(* synthesize *)
module mkTrapEncoder1Fail(EncoderIFC);
    // priority encoder for 9-bit input → need 4-bit output (ceil(log2(9)) = 4)
    method Bit#(3) encode(Bit#(9) in);
        // when in[8] == 1, output should be 4'd8 (index of highest bit)
        // but 3-bit output cannot represent 8 → truncation to 3'd0 or wrong value
        if (in[8] == 1) return 3'd0;       // BUG: highest bit index 8 doesn't fit
        else if (in[7] == 1) return 3'd7;
        else if (in[6] == 1) return 3'd6;
        else if (in[5] == 1) return 3'd5;
        else if (in[4] == 1) return 3'd4;
        else if (in[3] == 1) return 3'd3;
        else if (in[2] == 1) return 3'd2;
        else if (in[1] == 1) return 3'd1;
        else return 3'd0;
    endmethod
endmodule

endpackage
