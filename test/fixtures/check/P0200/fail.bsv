// Fixture: checkBVIScheduleGroupSyntax — fail case
// BVI schedule uses group syntax — BSC does not support this.

import "BVI" UartRx =
module mkUartRxFail#(Integer baudRate)(Empty);
    default_clock clk(CLK, (*unused*) CLK_GATE);
    default_reset rst(RST_N);

    method rx_data  data_in() enable(EN_rx_data);
    method rx_done  data_done() enable(EN_rx_done);
    method rx_frame_err frame_err() enable(EN_frame_err);

    schedule (rx_data, rx_done, rx_frame_err) CF (rx_data, rx_done, rx_frame_err);

    // Group syntax — INVALID, must be pair-wise
    schedule rx_data CF (rx_data, rx_done, rx_frame_err);
endmodule
