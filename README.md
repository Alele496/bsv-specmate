# specmate

[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-bsv--specmate-red?style=flat-square&logo=npm)](https://www.npmjs.com/package/bsv-specmate)
[![GitHub License](https://img.shields.io/github/license/Alele496/bsv-specmate?style=flat-square)](https://github.com/Alele496/bsv-specmate/blob/main/LICENSE)

> BSV 编码知识引擎 — Your Bluespec coding mate.

[🇬🇧 English Version](./README.en.md)

`specmate` 是一个 **BSV 编码知识引擎**——为 AI Agent 植入 Bluespec SystemVerilog 领域的知识层。内置编码记忆（11 条错误、自动计数）、规范文档（10 篇速查）、设计模式（5 种风格 + 7 个范式）、4,570 个官方用例。帮助 Agent 写出一次编译通过的 BSV 代码。

BSV 是冷门硬件描述语言，AI 训练数据停留在旧版本，编写代码很难一次编译成功。这个项目将编译错误经验积累为编码记忆，通过 MCP 协议让 Agent 在编写时就规避常见问题。

> **架构说明**：specmate 是 **Kova**（Knowledge Vault，领域知识引擎框架）在 BSV 领域的首个实例。
> 核心架构 = DKE（Domain Knowledge Engine）+ 编码记忆（Coding Memory）+ 约束链 + 角色激活。
> 详见 **[Kova 框架 →](https://github.com/Alele496/kova)** 和 `docs/collaboration.md`。

## 为什么需要 specmate

AI Agent 写 Python/JS 还行——训练数据多。但写 BSV 这种冷门硬件语言时，
模型知道基础语法却不懂领域陷阱：`vec()` 在 2025 版已废弃、`priority`
是 SV 保留字会报 P0005、Bool 不能拼接进 Bit 表达式、规则内调多个子
模块方法会 G0004……

每次编译报错都是一次性解决——不形成记忆。下次换个 Agent，还是同样的错。

specmate 解决的就是这件事：把编译错误变成可累积的编码记忆（SQLite 驱动，
命中自动 +1、高频排第一），把参考文档做成按需检索的 topic，把审查流程
封装成 Supervisor 角色——让 Agent 不再是 "每次从头学 BSV 的实习生"。

这套架构后来被证明可复用——不只是 BSV，任何冷门语言/领域都能用同样的
模式建立自己的知识引擎。这就是 **Kova 框架**。specmate 是它的首个完整实例。

→ **[Kova 框架](https://github.com/Alele496/kova)**

### 为什么不把 bsc 编译器打包进来？

specmate 是一个**预编译质控层**——它的价值在"编译前拦截"而非"编译后修复"。
`check_style` 能在不调用 bsc 的前提下检测 8 类常见语法/类型错误。

加上编译器意味着 200MB+ 的 Docker 镜像。对于有 WSL/Linux 的用户，
bsc 已经在本地了——Agent 直接调 shell 编译即可。编译器作为可选插件（Phase 3），
不纳入核心包。

| 特性 | 说明 | MCP 工具 |
|------|------|----------|
| **📋 编码硬约束** | SQLite 驱动，按命中次数排序的编码规则，随错误积累自动演进 | `coding_rules` |
| **🚀 编码前速览** | 写代码前看一眼高频错误 + 设计警告，避免踩坑 | `preflight` |
| **🔍 编译前静态检查** | 文本正则检测 rule/method 顺序、Bool 误用、SV 保留字冲突、`vec()` 陷阱、寄存器重复写入 | `check_style` |
| **📚 编码记忆** | 11 条真实编译错误，含现象、原因、解决方案；命中自动 +1 | `lookup_error` |
| **📖 BSV 规范参考** | 模块语法、类型系统、常见模式与陷阱 | `lookup_ref` |
| **🔎 官方用例搜索** | 4,570 个 BSC 测试套件 `.bsv`，按关键词搜索正确写法 | `lookup_example` |
| **✍️ 错误自动追加** | 遇到新错误直接调工具入库，无需手写 Markdown | `add_error` |
| **🎛️ 三级能力等级** | `silicon` / `wafer` / `tapeout` 控制返回信息量，适配不同开发场景 | `SPECMATE_LEVEL` |
| **📦 零配置安装** | `npm install -g` 一行装好，配置一句 JSON | — |
| **💾 数据持久化** | SQLite 知识库存 `~/.specmate/`，`SPECMATE_DATA` 自定义路径 | — |

- 🚀 [快速开始](#-快速开始)
- 🛠 [本地开发](#-本地开发)
- 📖 [详细教程 → docs/TUTORIAL.md](./docs/TUTORIAL.md)
- 🔧 [维护指南 → docs/MAINTAINER.md](./docs/MAINTAINER.md)
- 🇬🇧 [English → README.en.md](./README.en.md)

---

## 🥊 SHOWDOWN：specmate vs 裸 Agent

三场对照实验，相同需求，唯一变量是 specmate。

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

### 🎯 结论

两场实验下来，最有效的模式是：

**协作开发（Supervisor + Developer）+ 主动调用工具**

不是把工具列表写到 AGENTS.md 就行——第一战中 Agent B 全程 0 次调用工具。
第二战给 Agent 加了一个 **Supervisor 审查角色**，把"检查代码质量"变成它的职责，
Agent 自然就去调了 check_style、preflight、lookup_ref。

> 三行角色描述 > 六条编码规则 > 什么都没有。

---

## 📊 使用指南

| 场景 | 推荐模式 | 模板 | 效果 |
|------|---------|------|------|
| **大项目 / 新模块开发** | 🤝 **协作开发** (Supervisor + Developer) | [docs/collaboration.md](docs/collaboration.md) | 最高通过率，编码时间 -47%，Token +23% |
| **小改动 / 快速迭代** | 🔧 **独立开发** (solo Agent) | [examples/templates/](examples/templates/) | 轻量快速，AGENTS.md 极简模板 |

**怎么选**：
- 如果你在开发一个从未做过的模块 → 用协作模板，Supervisor 会帮你审查
- 如果你只是在修复一个已知 bug → 用独立模板，够用且省 Token
- 如果 Agent 多次忘了调 specmate → 在对话里轻轻戳一下 "试试 lookup_ref(topic=\"schedule\")？"

→ **[📖 完整争霸赛报告](docs/SHOWDOWN.md)**

逐回合翻车现场和分析 → **[📖 完整争霸赛报告](docs/SHOWDOWN.md)**。

---

## ⚡ 快速开始

### 安装

```bash
npm install -g bsv-specmate
```

### 配置 Claude Code

项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "specmate": {
      "command": "npx",
      "args": ["bsv-specmate"]
    }
  }
}
```

### 配置 OpenCode

在 `opencode.json` 中添加：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "specmate": {
      "type": "local",
      "command": ["node", "<项目绝对路径>/bin/server.mjs"],
      "enabled": true,
      "environment": {
        "SPECMATE_LEVEL": "wafer"
      }
    }
  }
}
```

配置后重启 AI 客户端，Agent 会自动发现 7 个 MCP 工具。

---

## 🏗️ 项目模板

快速搭建 BSV 项目：

```bash
cp examples/templates/AGENTS.md ./AGENTS.md
cp examples/templates/opencode.json ./opencode.json
```

编辑 `AGENTS.md` 填入项目描述和模块清单，`opencode.json` 中替换实际路径。
详细说明见 `examples/templates/README.md`。

---

## 🎛️ 能力等级

| Level | 名称 | 干涉方式 | 适用场景 |
|-------|------|---------|---------|
| **`silicon`** | 静默模式 | 首次告知工具箱，之后纯应答。不主动建议 | 小改动、已确 bug |
| **`wafer`** (默认) | 引导模式 | 每次返回末尾带交叉引用和场景建议 | 日常开发 |
| **`tapeout`** | 全程协作 | 编码前主动抛建议，编码中持续引导，报错后扫描级联问题。保持全程沟通 | 新模块、复杂项目、追求高质量代码 |

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
├── AGENTS.md              ← Agent 使用手册（独立/协作两种模式）
├── README.md              ← English
├── README.zh-CN.md        ← 中文版
├── package.json
├── bin/
│   └── server.mjs         ← MCP Server 入口，注册 7 个工具
├── src/
│   ├── config.mjs         ← 路径解析 + SOC 初始化
│   ├── db/
│   │   ├── schema.mjs     ← SQLite 表结构 + 查询
│   │   ├── seed.mjs       ← Markdown → SQLite
│   │   ├── export.mjs     ← SQLite → Markdown
│   │   └── query.mjs      ← 数据库查询封装
│   └── tools/
│       ├── coding_rules.mjs    ← 编码硬约束（SQLite 驱动）
│       ├── preflight.mjs       ← 编码前速览
│       ├── check_style.mjs     ← 编译前静态检查
│       ├── lookup_error.mjs    ← 编码记忆查询
│       ├── lookup_ref.mjs      ← 规范文档查询
│       ├── lookup_example.mjs  ← 官方用例搜索
│       └── add_error.mjs       ← 追加新错误
├── data/
│   └── knowledge.db       ← 预置种子数据库 (11 条编码记忆)
├── docs/
│   ├── BSV-STYLE.md       ← BSV 编码规范总则
│   ├── checklist.md       ← 编译前检查清单
│   ├── TUTORIAL.md        ← 详细教程
│   ├── errors/            ← 编码记忆原文 (11 条)
│   └── reference/         ← BSV 语法参考 (10 篇)
└── examples/
    ├── bsv/               ← BSC 官方测试套件 (4,570 .bsv)
    └── bs/                ← Bluespec Classic 旧语法（仅供参考）
```

---

## 🔧 npm 脚本

| 命令 | 说明 |
|------|------|
| `npm start` | 启动 MCP Server |
| `npm run db:seed` | 从 `docs/errors/*.md` 重建 SQLite |
| `npm run db:export` | 从 SQLite 导出 Markdown 到 `~/.specmate/docs/errors/` |

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

1. 遇到新的 BSV 编译错误 → Agent 通过 `add_error` 工具入库
2. `npm run db:export` 导出 Markdown
3. 提交 PR 将新错误合并回主仓库

---

## 💬 小贴士：让 Agent 用起来

两场实验下来，我们发现最有效的方式是**给 Agent 一个审查角色**（Supervisor），
工具调用从 0 飙到 10+。详见 [SHOWDOWN](#-showdownspecmate-vs-裸-agent)。

**日常使用中**，如果 Agent 写了半天没碰 specmate，轻轻戳一下就行——

```
如果遇到不确定的 BSV 语法，试试 lookup_ref(topic="xxx") 哦 🧠
```

同样的"戳法"：

- Agent 卡在 G0004 → "试试 lookup_ref(topic=\"schedule\") 看看调度注解？"
- Agent 不确定标准库用法 → "要不要查一下 lookup_ref(topic=\"stdlib\")？"
- Agent 写完代码没做检查 → "check_style 看一下？"

一行字，可能就少了一轮编译报错。🤏

（如果你发现了更好的"戳"法，欢迎 PR——说不定比我们的高明 😄）

---

## 📄 许可证

MIT
