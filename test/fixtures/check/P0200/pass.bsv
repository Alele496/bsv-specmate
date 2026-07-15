// Fixture: checkBVIScheduleGroupSyntax — pass case
// BVI schedule uses pair-wise declarations — correct.

import "BVI" UartRx =
module mkUartRxPass#(Integer baudRate)(Empty);
    default_clock clk(CLK, (*unused*) CLK_GATE);
    default_reset rst(RST_N);

    method rx_data  data_in() enable(EN_rx_data);
    method rx_done  data_done() enable(EN_rx_done);
    method rx_frame_err frame_err() enable(EN_frame_err);

    schedule (rx_data, rx_done, rx_frame_err) CF (rx_data, rx_done, rx_frame_err);
    schedule rx_data      CF rx_data;
    schedule rx_data      CF rx_done;
    schedule rx_data      CF rx_frame_err;
    schedule rx_done      CF rx_data;
    schedule rx_done      CF rx_done;
    schedule rx_done      CF rx_frame_err;
    schedule rx_frame_err CF rx_data;
    schedule rx_frame_err CF rx_done;
    schedule rx_frame_err CF rx_frame_err;
endmodule
