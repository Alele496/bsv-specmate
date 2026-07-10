# 对照实验原始数据

两场对照实验的原始记录和提示词。

## 实验清单

| # | 项目 | 日期 | 客户端 | 说明 |
|---|------|------|--------|------|
| 1 | [RISC-V 外设子系统](periph/) | 2026-07-03 | OpenCode | solo，4 Phase，7 模块 |
| 2 | [SD 卡控制器](sdcard/) | 2026-07-04 | CCB | goal 模式，Supervisor 协作，7 模块 |
| 3 | CRC-32 数据包处理器 | 2026-07-04 | CCB | 双盲评审，5 模块 |
| 4 | [跨时钟域 SoC 子系统](xclock/) | 2026-07-05 | CCB | 三级干涉 (silicon/wafer/tapeout) + 独立出题 + 独立盲审，5 模块 |
| 5 | [UART 异步串行发送器](../../specmate_bench/projects/02-uart/) | 2026-07-10 | CCB + specmate_bench | 自动化实验框架首战，双盲评审，1 模块 |

## 文件说明

每个实验目录包含：
- `RECORD.md` — 每轮编译错误和修复记录
- `PROMPTS.md` — 给 Agent 的提示词和编译脚本（部分实验）

完整分析报告 → [SHOWDOWN.md](../SHOWDOWN.md)
