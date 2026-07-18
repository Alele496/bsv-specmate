// Trap gpio-2: GPIO inout 信号通过 BVI 机制处理
// BSV 没有内置的 inout 端口类型。处理 GPIO 双向信号需要：
// 1. BSV interface 中定义 data_in、data_out、oe 三个独立 method
// 2. 通过 BVI import 将 Verilog 的 inout 端口拆分为三个信号
// 3. Verilog wrapper 中用 assign io = oe ? data_out : 'bz 实现三态控制
//
// Inout#() 包装器属于旧版 BSC 库用法，BSC 2025.07 中不推荐直接使用。
//
// 本 fixture 展示 BSV 端的 interface 设计（Verilog wrapper 见 gpio_wrapper.v）

package TrapGpio2;

interface GpioIFC;
    method Bit#(1) io_data_in;      // 从 GPIO 读
    method Bit#(1) io_data_out;     // 写 GPIO
    method Bit#(1) io_oe;           // output enable (1 = output, 0 = input)
    method Bit#(1) get_value;
endinterface

(* synthesize *)
module mkTrapGpio2(GpioIFC);
    Reg#(Bit#(1)) out_val <- mkReg(0);
    Reg#(Bit#(1)) oe_reg  <- mkReg(0);  // 0=input, 1=output
    Reg#(Bit#(4)) count   <- mkReg(0);

    rule toggle_oe;
        count <= count + 1;
        if (count == 5) begin
            oe_reg <= ~oe_reg;
        end
    endrule

    rule drive_output (oe_reg == 1'd1);
        out_val <= ~out_val;
    endrule

    // BSV interface 一侧：三个独立 method（不含 inout）
    method Bit#(1) io_data_in   = oe_reg == 0 ? 1'd0 : 1'd0;  // input 时为 0（由 wrapper 驱动）
    method Bit#(1) io_data_out  = out_val;
    method Bit#(1) io_oe        = oe_reg;
    method Bit#(1) get_value    = out_val;
endmodule

endpackage
