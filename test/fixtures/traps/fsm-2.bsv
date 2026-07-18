// Trap fsm-2: value method 不用 if-return，用 ?: 三元链
// BSV value method 使用 = expr 赋值语法，编译器译为纯组合逻辑。
// 在 value method 中用 if-return 会触发 P0030（非尾位置 return）。
// 正确做法：用 ?: 三元链替代所有 if-return 分支。
//
// 错误示范（注释示意，实际会触发 P0030）：
//   method Bit#(8) result;
//       if (state == IDLE) return 0;
//       else if (state == BUSY) return data;
//       else return 8'hFF;
//   endmethod
//
// 正确示范：用 ?: 三元链

package TrapFsm2;

typedef enum {IDLE, BUSY, DONE} State deriving (Bits, Eq);

interface FsmIFC;
    method State get_state;
    method Bit#(8) get_data;
    method Bool is_active;
endinterface

(* synthesize *)
module mkTrapFsm2(FsmIFC);
    Reg#(State) state <- mkReg(IDLE);
    Reg#(Bit#(8)) data <- mkReg(0);
    Reg#(Bit#(4)) count <- mkReg(0);

    rule increment (state == BUSY && count < 10);
        data <= data + 1;
        count <= count + 1;
        if (count == 9) state <= DONE;
    endrule

    // value method 全部用 ?: 三元链（不用 if-return）
    method State get_state = state;

    method Bit#(8) get_data =
        (state == IDLE) ? 0 :
        (state == BUSY) ? data :
        (state == DONE) ? 8'hFF : 8'h00;

    method Bool is_active = (state == BUSY);
endmodule

endpackage
