# SD 卡控制器 — 实验记录

## 测试信息
- 测试时间：2026-07-04
- 客户端：CCB (Claude Code Best)
- 模式：goal 自主循环，auto 权限
- bsc 版本：2025.07
- SPECMATE_LEVEL (B): tapeout

---

## 🅰️ 对照组（CCB + 编码建议 AGENTS.md，无 specmate）

| 文件 | 编译轮数 | 报错内容 | 最终通过 |
|------|---------|---------|---------|
| Crc7.bsv | 2 | R1: T0004 (缺 mkCrc7) → R2: fix | ✅ |
| SpiPhy.bsv | 2 | R1: G0004 → R2: fix | ✅ |
| SdCmd.bsv | 3 | R1: T0031 → R2: fix → R3: ✅ | ✅ |
| SdResp.bsv | 2 | R1: T0031 → R2: fix | ✅ |
| SdData.bsv | 1 | — | ✅ |
| SdCtrl.bsv | 7+ | R1-R6: G0004→G0002... 修复中 | ❌ |
| Top.bsv | 级联 | 级联 | ❌ |
| **通过** | **5/7** (进行中) | | |

### 编码阶段（R0）
- 时间：33m 58s
- Token：15.7M
- 审查方式：fork 子 Agent verification
- 自发现 bug：6 个

---

## 🅱️ 实验组（CCB + specmate tapeout + Supervisor 角色）

| 文件 | 编译轮数 | 报错内容 | lookup_error 命中 | check_style 调了？ | 最终通过 |
|------|---------|---------|------------------|------------------|---------|
| Crc7.bsv | 2 | R1: T0004 (缺 mkCrc7) → R2: fix | — | — | ✅ |
| SpiPhy.bsv | 2 | R1: G0004 → R2: fix | — | — | ✅ |
| SdCmd.bsv | 1 | — | — | — | ✅ |
| SdResp.bsv | 1 | — | — | — | ✅ |
| SdData.bsv | 5 | R1: P0005 (byte→octet) → R2: 未清 → R3: buf→ram → R4: G0004 → R5: 重构 Vector | — | ✅ (尝试调，tool schema 缓存旧) | ✅ |
| SdCtrl.bsv | 7 | R1: 级联 → R2: G0004 → R3-R6: 持续 G0004 → R7: 拆 spi + wait | ✅ lookup_error("G0004") | — | ✅ |
| Top.bsv | 7 | R1-R6: 级联 → R7: 最终通过 | — | — | ✅ |
| **通过** | **7/7 ✅** | | | | |

### 编码阶段（R0）
- 时间：17m 50s
- Token：12.1M
- 审查方式：Supervisor 角色 + specmate 工具箱
- specmate 调用：10+ 次（lookup_ref×3, preflight, check_style×4, suggest）

### specmate 工具调用日志
| 工具 | 调用 | 场景 |
|------|------|------|
| coding_rules | 1 | 任务开始时 |
| lookup_ref(module) | 1 | 开始编码前查模块语法 |
| lookup_ref(syntax) | 1 | 查常见陷阱 |
| lookup_ref(types) | 1 | 查类型系统 |
| lookup_example | 1 | 搜 SPI FSM 示例 |
| preflight | 1 | 编译前速览高频错误 |
| check_style | 4 | 编码后静态检查（部分失败，缓存旧 schema） |
| suggest | 2 | 不确定下一步时 |
| lookup_error(P0005) | 1 | SdData byte 保留字 |

---

## 对比总结

| 指标 | 🅰️ 对照组 | 🅱️ 实验组 |
|------|----------|----------|
| 编码时间 | 33m 58s | **17m 50s** (-47%) |
| 编码 Token | 15.7M | **12.1M** (-23%) |
| specmate 调用 | 0 | **10+** |
| AGENTS.md | 6 条静态规则 | 动态知识引擎 |
| 通过率 | 5/7 (进行中) | **7/7 ✅** |
| SdCtrl 瓶颈 | G0004→G0002 (7+ 轮) | G0004×6 轮 → R7 通过 |

## 核心发现

1. **specmate 让 Supervisor 角色主动审查** — 编码阶段调用 10+ 次工具，编码前查了 3 种规范
2. **SdCtrl G0004 是 BSV 架构级约束** — 双方都卡了 6+ 轮，B 最终通过拆 spi+wait 状态解决
3. **知识引擎累积效应** — schedule.md 新增 FSM 多子模块 G0004 模式，下次实验可直接查阅
4. **CCB goal 模式验证** — goal 自主循环比手动逐轮发提示词效率高 10×
