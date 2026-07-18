#!/bin/bash
# Batch compile all 9 new trap fixtures (2026-07-18 daily verification)
export PATH=${BSC_HOME:-/path/to/bsc}/bin:$PATH
cd "$(dirname "$0")/../../.."

FIXTURES=(
  "fsm-2|mkTrapFsm2"
  "schedule-1|mkTrapSchedule1"
  "arbiter-1|mkTrapArbiter1"
  "interrupt-2|mkTrapInterrupt2"
  "crc-2|mkTrapCrc2"
  "gpio-2|mkTrapGpio2"
  "uart-1|mkTrapUart1"
  "spi-1|mkTrapSpi1"
  "bram-1|mkTrapBram1"
)

TOTAL=0
PASS=0
FAIL=0

for entry in "${FIXTURES[@]}"; do
  IFS='|' read -r FIX TOP <<< "$entry"
  TOTAL=$((TOTAL + 1))
  echo "=== [${TOTAL}] Compiling ${FIX} (top: ${TOP}) ==="
  bsc -u -verilog -g "${TOP}" "test/fixtures/traps/${FIX}.bsv" 2>&1
  RC=$?
  echo "${FIX} exit code: ${RC}"
  if [ $RC -eq 0 ]; then
    PASS=$((PASS + 1))
    echo "  PASS"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL"
  fi
  echo ""
done

echo "=========================================="
echo "RESULTS: ${PASS}/${TOTAL} passed, ${FAIL}/${TOTAL} failed"
[ $FAIL -eq 0 ] && echo "ALL PASSED" || echo "SOME FAILED — check output above"
