// Trap interrupt-2: mask 位宽 vs pending 位宽对齐
// 中断控制器中 mask 寄存器和 pending 寄存器的位宽必须一致。
// mask 是每个中断线的使能位，pending 记录每个中断线的待处理状态。
// 位宽不一致会导致：(1) mask = 4'hF 但 pending 是 8-bit，
// mask & pending 运算产生位宽不匹配警告 T0051；
// (2) 高 bit 的 pending 永远无法被 mask 屏蔽。
//
// 正确做法：mask 和 pending 使用相同位宽 Bit#(n)，n = 中断线数量

package TrapInterrupt2;

interface IntIFC;
    method Bit#(8) get_irq;
endinterface

(* synthesize *)
module mkTrapInterrupt2(IntIFC);
    // 8 条中断线：mask 和 pending 都是 Bit#(8)，位宽对齐
    Reg#(Bit#(8)) pending <- mkReg(0);
    Reg#(Bit#(8)) mask    <- mkReg(8'hFF);  // 初始全使能
    Reg#(Bit#(8)) source  <- mkReg(0);

    // 模拟中断源
    rule gen_interrupt;
        source <= source + 1;
        pending <= source;  // 每个 bit 代表一条中断线
    endrule

    // mask & pending：位宽一致，运算安全
    rule compute_irq;
        // Bit#(8) & Bit#(8) → Bit#(8)，无位宽警告
        // only enabled + pending interrupts pass through
        let active = pending & mask;
        pending <= pending & (~active);  // 清除已处理的中断
    endrule

    // 常见错误（注释示意）：
    // Reg#(Bit#(4)) mask;    // 4-bit
    // Reg#(Bit#(8)) pending; // 8-bit
    // let active = pending & mask;  // T0051: 位宽不匹配！

    method Bit#(8) get_irq = pending & mask;
endmodule

endpackage
