#!/bin/bash
# Compile both trap fixtures for 2026-07-14 daily verification
export PATH=${BSC_HOME:-/path/to/bsc}/bin:$PATH
cd "$(dirname "$0")/../../.."

echo "=== Compiling fsm-1 ==="
bsc -u -verilog -g mkFsm1Test test/fixtures/traps/fsm-1.bsv 2>&1
FSM1_RC=$?
echo "fsm-1 exit code: $FSM1_RC"

echo ""
echo "=== Compiling axi-1 ==="
bsc -u -verilog -vsearch test/fixtures/traps -g mkAxiTrapTest test/fixtures/traps/axi-1.bsv 2>&1
AXI1_RC=$?
echo "axi-1 exit code: $AXI1_RC"

if [ $FSM1_RC -eq 0 ] && [ $AXI1_RC -eq 0 ]; then
    echo ""
    echo "BOTH PASSED"
    exit 0
else
    echo ""
    echo "SOME FAILED (fsm-1=$FSM1_RC, axi-1=$AXI1_RC)"
    exit 1
fi
