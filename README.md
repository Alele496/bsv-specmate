# specmate

[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-bsv--specmate-red?style=flat-square&logo=npm)](https://www.npmjs.com/package/bsv-specmate)
[![GitHub License](https://img.shields.io/github/license/Alele496/bsv-specmate?style=flat-square)](https://github.com/Alele496/bsv-specmate/blob/main/LICENSE)

> 🧠 Bluepec 终于有个 mate 了——一个懂 BSV、记得住你的翻车现场、会在编译前喊你看路的编码助手。

[🇬🇧 English Version](./README.en.md)

AI 写 Python 顺手得不得了。写 BSV？一编译，满屏红。不是 AI 笨——BSV 太冷门，训练数据全是老版本：`vec()` 已经被废弃了它照写，`priority` 是 SV 保留字它也敢拿来做变量名，Bool 居然试图拼进 Bit 表达式……编译器崩溃之前都不知道哪儿出错了。

更头疼的是：每次编译报错都是一次性消耗品。换个 Agent，从头踩同样的坑。

**specmate 就是填这个坑的。** 它不帮 Agent 编译——它在写代码之前先把坑指出来。26 条编码记忆（SQLite 驱动，命中自动 +1，高频排第一）、17 条静态检查规则、30 个领域知识图谱节点、4,570 个官方示例。通过 7 个 MCP 工具嵌进 AI Agent——**`specmate_scan` 是推荐入口**，让 Agent 写 BSV 的时候背后有个 mate 在耳边 bb。

> specmate 是 **Kova**（Knowledge Vault，领域知识引擎框架）在 BSV 领域的第一只 mate。核心架构 = DKE（Domain Knowledge Engine）+ 编码记忆 + 约束链 + 角色激活。详见 **[Kova →](https://github.com/Alele496/kova)** 和 `docs/collaboration.md`。

## 🤔 为什么需要 specmate

写 BSV 的日常是这样的：写完第一版，编译——P0005，改——P0032，再改——G0004，咬牙再改——G0010。一轮一轮，修的不是逻辑 bug，是"语言规则你记不住"。

问题不在你也不在 AI。BSV 编译器 2025.07 版和旧版有显著差异，训练数据跟不上。Agent 掌握基础语法但不认识新版陷阱。更糟的是——没有记忆。同样一个 G0004，换个 Agent 能踩三遍。

specmate 做的事：把每次踩坑变成一条编码记忆。下次 Agent 写到类似场景时，specmate 在它问之前就把该注意的列出来——"你做 FIFO pipeline？注意 G0010，上一个 Agent 在这翻了三次。"

### 为什么不把 bsc 编译器打包进来？

因为不是摔倒后再扶——是走路前喊"看路"。specmate 是个预编译质控层：不调 bsc 就能检测 18 类常见语法和类型错误。

加上编译器意味着 200MB+ 的 Docker 镜像。对于有 WSL/Linux 的用户，bsc 本来就在本机——Agent 直接调 shell 编译就行。编译器作为可选 Phase 3 插件，不纳入核心。

## 🛠 它能做什么

你要写 BSV → specmate 先看看你要做啥，预测哪里容易翻车 → 你写完了它过一遍 → 编译报错了它告诉你为什么 + 怎么修 → 下次同一个坑它提前拦。像个记仇的 code buddy。

| 特性 | 说明 | 调用方式 |
|------|------|---------|
| **🧠 知识扫描** | `specmate_scan` 统一入口：编码前陷阱提醒 + AST 预扫描 + 设计决策建议 + 下一步建议 | `specmate_scan` |
| **🔍 编译前体检** | 17 条规则扫 .bsv：方法顺序、Bool 运算符误用、SV 保留字冲突、字面量溢出、interface Bool 返回、always_ready 滥用……不调 bsc，纯静态 | `specmate_check` |
| **✍️ 长记性** | bsc 编译报错 → `specmate_capture` 自动解析错误码入库 → 修好 → `specmate_resolve` 固化修复方案。同一错误码反复出现时自动提醒 | `specmate_capture` + `specmate_resolve` |
| **🔬 代码结构审查** | tree-sitter 真解析 BSV 语法树：调度冲突矩阵、跨 rule 冲突、依赖图、调用图、寄存器分析。⚠️ 不处理编译输出 | `specmate_analyze` |
| **🎛️ 三级干涉** | `verify` 社恐模式 / `develop` 日常模式 / `tapeout` 话痨模式。同一个工具，话多少看你选哪档 | `SPECMATE_LEVEL` |
| **📦 零配置** | `npm install` 装好依赖，`.mcp.json` 三行配置。`npm run db:seed` 一键初始化知识库 | — |
| **💾 不丢数据** | SQLite 自动存 `~/.specmate/`，换电脑换 Agent 记忆还在 | — |

- 🚀 [快速开始](#-快速开始)
- 🛠 [本地开发](#-本地开发)
- 📖 [详细教程 → docs/TUTORIAL.md](./docs/TUTORIAL.md)
- 🇬🇧 [English → README.en.md](./README.en.md)

---

## 🥊 SHOWDOWN：specmate vs 裸 Agent

我们做了四场对打——Agent 完成同一个 BSV 项目，唯一区别是带了 specmate 还是裸写。第三场拉了个不认识双方的 Agent 做双盲评审，第四场引入独立考试委员会出题 + 三级干涉强度对比。

结果？带 specmate 的更快、更稳、代码质量更高。

### Round 1：RISC-V 外设 (OpenCode)

| | A（无） | B（specmate） |
|---|---|---|
| 修复轮数 | 11 | **9 (-18%)** |

### Round 2：SD 卡控制器 (CCB × 协作)

| | A（6条规则） | B（Supervisor + specmate） |
|---|---|---|
| 编码时间 | 33m58s | **17m50s (-47%)** |
| 通过率 | 5/7 | **7/7** |

### Round 3：CRC-32 处理器 (CCB × 盲审)

首次引入**双盲代码评审**——匿名 Agent 不知道哪套代码是谁写的：

| | A（6条规则） | B（specmate） |
|---|---|---|
| 编码时间 | 19m47s | **9m27s (-52%)** |
| 代码质量 (盲审/25) | 19 | **22 (+16%)** |

评审 Agent 的评语：*"code-2 是更工程化的答案——显式状态机、防御性 provisos、参数化 FIFO。代价是代码多 63%，但值得。"*

### Round 4：跨时钟域 SoC (CCB × 三级干涉 × 独立盲审)

首次引入**独立 AI 考试委员会出题**和 **silicon/wafer/tapeout 三级干涉对比**：

| | A（无） | B1 (silicon) | B2 (wafer) | B3 (tapeout) |
|---|---|---|---|---|
| 盲审分数 (/100) | 85.5 | **96.5** 🥇 | 88.0 | 88.0 |

**社恐模式赢了。** B1（silicon，话最少）比 B3（tapeout，话最多）高 8.5 分。话少 = 专注核心设计。过多"你可能还需要考虑…"反而分散注意力。

### Round 5：UART 发送器 (CCB × specmate_bench 自动化框架)

首次使用 **specmate_bench 自动化实验框架**——不再是手工复制提示词，而是框架统一管理全流程。

| | A（6条规则） | B（specmate + Supervisor） |
|---|---|---|
| 编译结果 | R1 ❌ T0043 → R2 ✅ | R1 ✅ (5w) → R2 ✅ 0w |
| 代码质量 (盲审/25) | 16 | **22 (+37.5%)** |
| 架构 | 2-rule 极简 | 5-rule 显式 FSM |
| 关键缺陷 | busy 假空闲，缺 synthesize | guard 互斥消除全部 warning |

**新发现**：T0043（Integer 参数不可综合）入库；tree-sitter-bsv 将 `<=` 比较误识别为赋值。

### 🎯 五场之后，又三场

五场下来，最有效的不是"写更多的规则"，而是**给 Agent 一个审查角色**。

第一战里 Agent B 全程 0 次打开 specmate——不是工具不好，是它根本不知道自己有 mate。第二战给 Agent 加了 Supervisor 审查角色："你要检查代码质量。" 突然开窍了——10+ 次主动调用。第四战更进一步——不是话越多越好，silicon 社恐模式拿了最高分。第五战引入了自动化实验框架，让对照实验从"手工复制粘贴"变成"几条命令跑完"。

后续三场（SPI、AXI-Stream、CRC-8）验证了两个新发现：

**快≠好。** SPI Master 实验里，Agent B（specmate）3 轮就编译通过，Agent A 花了 6 轮——但盲审结果 Agent A 胜出。specmate 帮你修编译错误，但不帮你做正确设计。LSB-first 违反 SPI 惯例、缺少 FIFO 丢数据——这些 specmate 没拦。

**任务难度决定 specmate 价值。** AXI-Stream 适配器双方首轮双通——标准化接口协议不需要领域知识。CRC-8 的 Ultracode 全自动框架首次跑通 scaffold → code (A+B 并行)。

> 三行角色描述 > 六条编码规则 > 什么都没有。

---

## 📊 使用指南

| 场景 | 推荐模式 | 模板 | 效果 |
|------|---------|------|------|
| **大项目 / 新模块开发** | 🤝 **协作开发** (Supervisor + Developer) | [docs/collaboration.md](docs/collaboration.md) | 最高通过率，编码时间 -47% |
| **小改动 / 快速迭代** | 🔧 **独立开发** (solo Agent) | [examples/templates/](examples/templates/) | 轻量快速，AGENTS.md 极简模板 |

**怎么选**：
- 从头开发一个你没做过的模块 → 协作模板，Supervisor 帮你审查
- 修一个已知 bug → 独立模板就够了，省 Token
- Agent 多次忘了调 specmate → 对话里戳一下 "specmate_guide(phase=\"pre_code\", input=\"...\")"

→ **[📖 完整争霸赛报告](docs/SHOWDOWN.md)**

---

## ⚡ 快速开始

### 安装

```bash
npm install -g bsv-specmate
```

### 启动服务器

**stdio 模式**（CCB 自动拉起，无需手动）：
```json
// .mcp.json
{ "mcpServers": { "bsv-specmate": { "command": "npx", "args": ["bsv-specmate"] } } }
```
CCB 启动时自动拉起子进程，关闭时自动销毁。适合单人开发。

**Streamable HTTP 模式**（需手动启动，支持主动推送）：
```bash
# 终端 1：启动服务器
node bin/server.mjs
# → [specmate] MCP Streamable HTTP on http://127.0.0.1:9339/mcp

# 或后台运行
node bin/server.mjs &
```
```json
// .mcp.json
{ "mcpServers": { "bsv-specmate": { "url": "http://127.0.0.1:9339/mcp" } } }
```
服务器独立运行，CCB 通过 HTTP 连接。支持 specmate 主动推送通知。`/health` 端点可检查状态。

> **两个模式可以共存**。CCB 目前 stdio 最方便（自动启停），Streamable HTTP 适合需要推送的场景。后续考虑 CCB hook 实现 Streamable HTTP 自动启停。

### 配置 CCB / Claude Code

项目根目录放一个 `.mcp.json`：

```json
// npm 版 (stdio)
{
  "mcpServers": {
    "bsv-specmate": { "command": "npx", "args": ["bsv-specmate"] }
  }
}

// 本地开发版 (stdio)
{
  "mcpServers": {
    "bsv-specmate": {
      "command": "node",
      "args": ["<absolute-path>/bin/server.mjs"],
      "env": { "SPECMATE_LEVEL": "develop" }
    }
  }
}

// Streamable HTTP 版（推荐 — 支持 specmate 主动推送）
// 先启动服务器：node bin/server.mjs
// 再配置 CCB 连接：
{
  "mcpServers": {
    "bsv-specmate": {
      "url": "http://127.0.0.1:9339/mcp"
    }
  }
}
```

> **默认模式**：`develop`（开发模式），编码前推送陷阱。改成 `verify` 零推送快速迭代，`tapeout` 全量守护交付前检查。
```

### 配置 OpenCode

项目根目录放一个 `opencode.json`：

```json
// npm 版
{ "$schema": "https://opencode.ai/config.json",
  "mcp": { "bsv-specmate": { "type": "local", "command": ["npx", "bsv-specmate"], "enabled": true } } }

// 本地开发版
{ "$schema": "https://opencode.ai/config.json",
  "mcp": { "bsv-specmate": { "type": "local", "command": ["node", "<absolute-path>/bin/server.mjs"], "enabled": true, "environment": { "SPECMATE_LEVEL": "wafer" } } } }
```

重启 AI 客户端，Agent 自动发现 MCP 工具。

---

## 🏗️ 项目模板

快速搭一个 BSV 项目：

```bash
cp examples/templates/AGENTS.md ./AGENTS.md
cp examples/templates/opencode.json ./opencode.json
```

编辑 `AGENTS.md` 把你的项目描述和模块清单填进去。详见 `examples/templates/README.md`。

---

## 🎛️ 三级开发模式

specmate 不按"Agent 经验"分级——按**你的代码要去哪**。同一个 Agent 改 bug 开验证、写新模块开开发、交付前开流片。

第四战用独立考试委员会 + 双盲评审实测了三级的效果：

| Level | 场景 | 推送策略 | 盲审 (/100) |
|-------|------|---------|:----------:|
| **`verify`** 🔬 | 快速迭代，跑通逻辑 | 零推送，问才答 | — |
| **`develop`** (默认) 🛠 | 写新模块，搭架构 | 编码前推送陷阱 | — |
| **`tapeout`** 🏭 | 要交出去了，FPGA/ASIC | 全量推送+审查 | **96.5** vs 85.5 (无 specmate) |

**设计原则**：不是话越多越好——是在正确时机说正确的话。

```
verify:  别挡我，我自己能搞定
develop: 编码前提醒陷阱，别让我踩坑
tapeout: 一个都别漏，全面守护
```

> 旧名称 `silicon`/`wafer` 仍兼容，自动映射到 `verify`/`develop`。

---

## 🛠 本地开发

### 环境要求

- [Node.js](https://nodejs.org/) >= 18

```bash
git clone https://github.com/Alele496/bsv-specmate.git
cd bsv-specmate
npm install
node bin/server.mjs
```

### IDE 开发配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "specmate": {
      "type": "local",
      "command": ["node", "<绝对路径>/bin/server.mjs"],
      "enabled": true
    }
  }
}
```

---

## 📂 项目结构

```
bsv-specmate/
├── AGENTS.md              ← Agent 使用手册（4 步检查式工作流）
├── README.md              ← 中文版（你在这里）
├── README.en.md           ← English
├── SKILL.md               ← Agent 交互速查（8 种场景）
├── package.json
├── bin/
│   ├── server.mjs         ← MCP Server 入口，注册 7 个 MCP 工具
│   └── cli.mjs            ← CLI 入口（npx specmate scan/check，仅供人类调试）
├── src/
│   ├── config.mjs         ← SPECMATE_LEVEL 配置 + 数据目录管理
│   ├── notify.mjs         ← MCP notification 桥接
│   ├── db/
│   │   ├── schema.mjs     ← SQLite 表结构 + session 管理
│   │   ├── query.mjs      ← 数据库查询封装 + auto-seed（自动初始化空库）
│   │   ├── seed.mjs       ← db:seed 脚本 — Markdown → SQLite（幂等模式）
│   │   ├── export.mjs     ← db:export 脚本 — SQLite → Markdown
│   │   └── parser.mjs     ← 错误 Markdown 文件解析器
│   └── tools/
│       ├── specmate_guide.mjs  ← 核心工具：scan() 统一入口 + guide 细分阶段
│       ├── _matcher.mjs        ← 知识图谱（30 个领域节点 + 2 个通用陷阱）
│       ├── _patterns.mjs       ← BSV 代码范式模板（15 个）
│       ├── check_style.mjs    ← specmate_check 后端（17 条规则）
│       ├── preflight.mjs       ← 编译前 AST 扫描（6 种高频错误模式）
│       ├── ast_query.mjs       ← tree-sitter BSV 解析器（10+ 种分析）
│       ├── knowledge_snapshot.mjs ← 离线知识快照导出
│       └── ...                 ← 内部辅助模块
├── test/
│   └── fixtures/
│       ├── check/          ← check 规则 pass/fail fixture
│       ├── traps/          ← trap 验证 fixture（3 条已验证）
│       └── run-fixtures.mjs ← fixture CI 脚本
├── data/
│   ├── knowledge.db        ← 预置种子数据库（26 条错误码）
│   └── testsuite-errors.json
├── docs/
│   ├── getting-started.md  ← 新手指南（推荐起点）
│   ├── agent-integration.md ← Agent 集成手册
│   ├── architecture.md     ← 架构决策文档
│   ├── internal-overview.md ← 内部架构总览
│   ├── errors/             ← 编码记忆原文（26 篇）
│   └── reference/          ← BSV 语法参考
└── examples/
    ├── bsv/                ← BSC 官方测试套件
    └── templates/          ← 项目模板（AGENTS.md 等）
```

---

## 🔧 npm 脚本

| 命令 | 说明 |
|------|------|
| `npm start` | 启动 MCP Server |
| `npm run db:seed` | 从 `docs/errors/*.md` 一键初始化数据库 |
| `npm run db:export` | 从 SQLite 导出 Markdown 到 `~/.specmate/docs/errors/` |
| `npm test` | 运行单元测试（query / matcher / ast_query） |
| `npm run knowledge:validate` | 知识质量验证（bscVersions / verified 字段 / 文档完整性） |
| `npm run verify-traps` | 列出所有未验证 trap（支持 --json/--csv） |

---

## 💾 数据存储

首次启动自动创建 `~/.specmate/`：

| 路径 | 内容 |
|------|------|
| `data/knowledge.db` | SQLite 知识库 |
| `docs/errors/*.md` | 导出的 Markdown 文档 |

自定义路径：

```json
{
  "env": { "SPECMATE_DATA": "D:/my-bsv-data" }
}
```

---

## 🤝 贡献

1. Agent 碰到新的编译错误 → `specmate_capture` + `specmate_resolve` 固化经验
2. `npm run db:export` 导出 Markdown
3. 提 PR 共享新知识到主仓库

---

## 💬 新手？从这里开始

→ **[📖 specmate 新手指南](docs/getting-started.md)** — 安装、配置 MCP、第一次使用、常见问题。

---

## 💬 Agent 不听话？你不是第一个

第一场实验里，Agent B 全程 **0 次** 调 specmate。不是工具不好——是它压根不知道有这么个 mate。

直到给了 Agent 一个"审查者"角色——"你要检查代码质量哦。" 突然开窍了。10+ 次主动调用。

**所以你只需要在对话里轻轻说一句：**

| 时机 | 调哪个 | 一句话 |
|------|--------|--------|
| 编码前 | **`specmate_scan`** ⭐ 推荐入口 | `specmate_scan({ task: "简短描述你的任务" })` |
| 写完码 | **`specmate_check`** | `specmate_check({ files: ["绝对路径/文件.bsv"], full: true })` |
| 编译报错 | **`specmate_capture`** + **`specmate_resolve`** | capture 记录错误 → 修复 → resolve 固化经验 |
| 错误诊断 | **`specmate_guide`** | `specmate_guide({ phase: "on_error", input: "<错误信息>" })` |
| 深度分析 | **`specmate_analyze`** | `specmate_analyze({ files: ["绝对路径"], question: "调度冲突" })` |
| 追踪 warning | **`specmate_diff`** | snapshot 保存基线 → 修复 → diff 对比变化 |

几个关键工具，几个正确时机。就这一句话，少一轮编译报错。屡试不爽。

→ 详细的 Agent 集成说明见 **[Agent 集成手册](docs/agent-integration.md)**。

---

> 📄 MIT License
>
> 👤 由 [Alele496](https://github.com/Alele496) 倾力打造。愿每次编译少一行 Error——实在不行，还有 specmate 兜底。🤙
