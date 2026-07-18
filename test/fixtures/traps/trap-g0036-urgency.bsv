package TrapG0036Urgency;

// G0036 fixture: 两 rule 写同一寄存器，无 urgency 标注
// rl_a 写 count <= 1，rl_b 写 count <= 2
// BSC 无法确定执行顺序 → G0036 警告（推断 urgency）
// 伴随 G0117 阴影警告（后执行的 rule 覆写前一个的效果）
//
// 断言: 多个 rule 通过 _write 方法访问同一寄存器时不加
// descending_urgency，BSC 报 G0036（urgency 推断）+ G0117（阴影）警告。

(* synthesize *)
module mkTrapG0036Urgency(Empty);
    Reg#(Bit#(8)) count <- mkReg(0);

    rule rl_a;
        count <= 1;
    endrule

    rule rl_b;
        count <= 2;
    endrule
endmodule

endpackage
