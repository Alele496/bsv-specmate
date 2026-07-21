// Expected issue: decoder-1 — 译码器输出位宽不足，one-hot 向量长度截断
// 这是设计级陷阱：代码可正常编译，但 3-bit 输入用 6-bit 输出，2^3 = 8 位实际需要
// 输出截断导致部分地址无法正确解码
package TrapDecoder1Fail;

interface DecoderIFC;
    method Bit#(6) decode(Bit#(3) addr);   // BUG: output width should be 2^3 = 8
endinterface

(* synthesize *)
module mkTrapDecoder1Fail(DecoderIFC);
    integer i;

    method Bit#(6) decode(Bit#(3) addr);
        Bit#(6) result = 0;
        // BUG: only 6 bits available for 3-bit address → 2 addresses (addr=6,7) unresolvable
        // 3-bit address decodes 8 positions (0-7), but only 6 output bits exist
        for (i = 0; i < 6; i = i + 1) begin
            if (addr == fromInteger(i))
                result[i] = 1;
        end
        return result;
    endmethod
endmodule

endpackage
