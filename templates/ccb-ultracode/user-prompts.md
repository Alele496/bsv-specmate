# 用户提示词模板（硬件工程师用）

## 模板 1：简单模块

```
帮我写一个 SPI Master 控制器。
- 模式 0/3，可配置时钟分频
- 接口用 FIFOF，数据位宽 8-bit
- 输出 .bsv + testbench
```

## 模板 2：复杂 SoC 集成

```
帮我集成以下模块，AXI4-Stream 互联：
- SPI Master（已有，bsv/SpiMaster.bsv）
- UART（已有，bsv/Uart.bsv）
- BRAM buffer，双端口，4KB
写 Top.bsv 和 testbench。
```

## 模板 3：修改已有代码

```
我的 FIFO pipeline 有 G0010 调度冲突，帮我修。
源码在 bsv/Pipeline.bsv。
不要大改架构，最小修复。
```

## 模板 4：Spec 驱动开发

```
模块名：AES128 加密核
接口：
  - 输入 FIFOF：key[127:0], plaintext[127:0], start
  - 输出 FIFOF：ciphertext[127:0], done
功能：
  - 10 轮 AES-128，纯组合逻辑 S-Box
  - 流水线化，每轮 1 cycle
帮我实现。
```
