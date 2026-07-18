# bram-1: BRAMCore: 读/写端口分离 vs BRAM: 单端口 — 选对类型

> 适用 BSC 版本: 2025.07

## 现象

在需要同一 cycle 读写不同地址的流水线场景中使用了 BRAM（单端口），导致读/写冲突或被迫增加额外的缓冲 cycle，降低吞吐量。

## 原因

BSV 提供两种 Block RAM 抽象：

- **BRAMCore**: 独立读端口 + 写端口（真双口），可同 cycle 读写不同地址，适合流水线场景
- **BRAM**: 单端口，同一 cycle 只能读或写，适合简单存储场景

关键是：BRAMCore 的读写是独立的端口（`portA.put()` 写 + `portB.read()` 读），BRAM 同一端口只能读或写。

## 解决方案

需要同 cycle 读写（不同地址）时选 BRAM（双端口）。

```bsv
import BRAM::*;

// BRAM: 双端口，portA 写 + portB 读，同 cycle 不同地址安全
let cfg = defaultValue;
cfg.allowWriteResponseBypass = False;
BRAM1Port#(Bit#(8), Bit#(8)) bram <- mkBRAM1Server(cfg);

rule write_op;
    bram.portA.request.put(BRAMRequest{
        write: True, responseOnWrite: False,
        address: waddr, datain: wdata
    });
endrule

rule read_op;
    bram.portA.request.put(BRAMRequest{
        write: False, responseOnWrite: False,
        address: raddr, datain: ?
    });
    let val <- bram.portA.response.get();
endrule
```

> **注意**：BRAM 双端口 `mkBRAM(False)` 提供 `portA` + `portB` 两个独立端口，
> 可同 cycle 读写不同地址。`BRAM1Port` 是单端口，同一 cycle 只能一个操作。

## 规则

- severity: quality
- phase: design
- bscDetectable: false (选错类型编译通过但行为不同)
- bscVersions: ['2025.07']
