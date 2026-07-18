// Trap fsm-1: StmtFSM 隐式并行写 — 避免同一 cycle 写同一 Reg
// StmtFSM 的 action 块内所有语句在同 1 个 clock cycle 中并行执行。
// 若同一 action 内对同一 Reg 写入多次，最后一次写入胜出，前几次被覆盖
// ——这是隐式行为，不产生编译警告，极易造成逻辑错误。
// 正确做法：每个 state 内每个 Reg 最多写一次。

import StmtFSM::*;

(* synthesize *)
module mkFsm1Test(Empty);
    Reg#(Bit#(8))  val   <- mkReg(0);
    Reg#(Bit#(4))  state <- mkReg(0);

    // 正确示范：每个 action 中 val 只写一次
    FSM fsm <- mkFSM(seq
        // state 0: 初始化
        action
            val   <= 0;
            state <= 0;
        endaction

        // state 1: 递增
        action
            val   <= val + 1;
            state <= 1;
        endaction

        // 常见错误（注释示意，实际编译可能通过但行为错误）：
        // action
        //    val <= 1;
        //    val <= 2;   // ← 同一 cycle 写同一 Reg，val 终值为 2，1 被覆盖
        // endaction
    endseq);

    rule drive_fsm;
        fsm.start;
    endrule
endmodule
