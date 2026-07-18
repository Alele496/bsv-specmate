// Trap schedule-1: descending_urgency 不循环
// BSV 的 descending_urgency 属性声明 rule 优先级链：列表中靠前的 rule
// 优先级高于靠后的。属性值中的引用关系不能形成循环——一旦出现
// 循环（如 rl_a > rl_b > rl_c > rl_a），BSV 编译器会拒绝。
//
// 正确做法：优先级链是线性的，不形成环。每个 rule 只出现在链中一次。

package TrapSchedule1;

interface ScheduleIFC;
    method Bit#(8) get_total;
endinterface

(* synthesize *)
module mkTrapSchedule1(ScheduleIFC);
    Reg#(Bit#(8)) total <- mkReg(0);
    Reg#(Bit#(8)) inc_a <- mkReg(0);
    Reg#(Bit#(8)) inc_b <- mkReg(0);
    Reg#(Bit#(4)) cycle <- mkReg(0);

    // 三个 rule 都写 total 寄存器，需要优先级
    // descending_urgency 指定线性优先级：rl_a > rl_b > rl_c
    // 这是无环的合法链——rl_c 优先级最低，rl_a 最高
    (* descending_urgency = "rl_a, rl_b, rl_c" *)

    rule rl_a (cycle == 0);
        total <= total + inc_a;
        cycle <= 1;
    endrule

    rule rl_b (cycle == 1);
        total <= total + inc_b;
        cycle <= 2;
    endrule

    rule rl_c (cycle >= 2);
        total <= 0;
        cycle <= 0;
        inc_a <= inc_a + 1;
        inc_b <= inc_b + 2;
    endrule

    method Bit#(8) get_total = total;
endmodule

endpackage
