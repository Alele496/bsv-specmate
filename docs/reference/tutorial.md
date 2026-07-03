# BSV 中文教程参考

> 来源：[WangXuan95/BSV_Tutorial_cn](https://github.com/WangXuan95/BSV_Tutorial_cn) — 最全面的中文 BSV 教程。

## 教程章节

| 章节 | 内容 | 关键知识点 |
|------|------|-----------|
| 1 | Hello World | 基础编译流程 |
| 2 | DecCounter | 递减计数器、`mkReg` |
| 3 | SPIWriter | SPI 主机控制器实战 |
| 4 | GrayCode | 格雷码编码、组合逻辑 |
| 5 | TupleTest | Tuple 复数类型 |
| 6 | RegTest | `mkReg`/`mkRegU`/`mkDReg` |
| 7 | WireTest | `mkDWire`/`mkWire`/`mkBypassWire` |
| 8 | RuleTest | 规则基础 |
| 9 | RuleUrgency | `descending_urgency` |
| 10 | RuleNoConflict | `mutually_exclusive` vs `conflict_free` |
| 11 | RulePreempts | `preempts` 抢占 |
| 12 | CRegTest | `mkCReg` 冲突寄存器 |
| 13 | BitCoding | 位运算进阶 |
| 14-24 | 综合实战 | 递增寄存器、开方、RAM、缓冲、枚举、多态等 |
| JpegEncoder | JPEG 压缩器 | 300 行 BSV 实现 |
| Rv32iCPU | RISC-V CPU | 200 行 BSV 五级流水 CPU |
| SPIFlash | SPI Flash 读写 | SPI 全栈实战 |

## 调度章节快速索引

- **`descending_urgency`** — 第 9 节 `src/9.RuleUrgency/`
- **`mutually_exclusive` vs `conflict_free`** — 第 10 节 `src/10.RuleNoConflict/`
- **`preempts`** — 第 11 节 `src/11.RulePreempts/`

## 使用方法

教程全文位于仓库 `README.md`（7094 行）。可通过以下方式搜索：

```
lookup_example(keyword="urgency", directory="bsv-tutorial")
```

或直接打开教程链接查阅对应章节。
