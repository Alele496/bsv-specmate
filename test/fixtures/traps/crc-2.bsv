// Trap crc-2: Bool vs Bit#(1) 区分 — done/error 等硬件控制信号用 Bit#(1)
// 硬件控制信号（如 done、error、valid）应该用 Bit#(1) 而非 Bool。
// 原因：Bit#(1) 可以直接参与位拼接、从总线提取/注入，
// 与标准库 interface method 保持一致。bsc 2025.07 中
// Bool 与 Bit#(1) 混用在 interface 中会被捕获（T0061），
// 但内部信号不会——养成从一开始就用 Bit#(1) 的习惯。

package TrapCrc2;

interface CrcIFC;
    method Bit#(1) get_done;
    method Bit#(8) get_result;
endinterface

(* synthesize *)
module mkTrapCrc2(CrcIFC);
    Reg#(Bit#(8)) data   <- mkReg(0);
    Reg#(Bit#(8)) crc    <- mkReg(0);
    Reg#(Bit#(1)) done   <- mkReg(0);   // 用 Bit#(1) 而非 Bool
    Reg#(Bit#(4)) cnt    <- mkReg(0);

    rule process (cnt < 8);
        crc <= crc ^ data;
        cnt <= cnt + 1;
    endrule

    rule finish (cnt == 8);
        done <= 1'd1;
    endrule

    // interface method 返回 Bit#(1)，可直接拼入状态总线
    method Bit#(1) get_done  = done;
    method Bit#(8) get_result = crc;
endmodule

endpackage
