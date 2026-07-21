# dma-1: DMA 描述符链用 FIFO 传递

> 适用 BSC 版本: 2025.07

## 现象

DMA 引擎中描述符链表的消费者 rule 读到的描述符指针数据不一致——时而读到过期值，时而读到不定态（X）。BSC 编译通过（无编译错误或调度冲突），但仿真行为异常。

## 原因

Wire 是组合逻辑，信号值仅在一个时钟周期内有效。当 DMA 引擎的 producer rule 在当前 cycle 写入 Wire，而 consumer rule 跨 cycle 读取时，Wire 信号已经无效，consumer 读到过期数据或不定态。

这是 BSV 中跨 rule 数据传递的经典设计陷阱——Wire 和 FIFO 的选择取决于时间维度：
- Wire：同一 cycle 内传递（组合逻辑路径）
- FIFO：跨 cycle 传递（时序逻辑路径）

与 `trap-pulsewire-reg` 同理：DMA 描述符指针是跨 cycle 的状态信息，必须用时序元件（FIFO/Reg）保存。

## 解决方案

用 FIFO（至少 depth 2）在 producer 和 consumer rule 之间传递描述符指针：

```bsv
// 错误 — Wire 只在当前 cycle 有效
Wire#(DescriptorPtr) next_ptr <- mkWire;
rule produce;
    next_ptr <= current;  // 写入
endrule
rule consume;
    let ptr = next_ptr;   // 下个 cycle 读到不定值
endrule

// 正确 — FIFO 跨 cycle 可靠传递
FIFO#(DescriptorPtr) desc_fifo <- mkFIFO;  // at least depth 2
rule produce;
    desc_fifo.enq(current);  // 入队
endrule
rule consume;
    let ptr = desc_fifo.first();
    // ... 处理
    desc_fifo.deq();  // 消费后出队
endrule
```

选择要点：
- 单 consumer、固定延迟 → mkFIFO depth=2 即可
- 多 consumer 或反压不确定 → 用 `mkFIFOF` 配合 `notEmpty`/`notFull` 条件

## 规则

- severity: quality
- phase: design
- bscDetectable: false
- bscVersions: ['2025.07']
