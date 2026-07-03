# specmate

[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-specmate-red?style=flat-square&logo=npm)](https://www.npmjs.com/package/specmate)
[![GitHub License](https://img.shields.io/github/license/Alele496/bsv-specmate?style=flat-square)](https://github.com/Alele496/bsv-specmate/blob/main/LICENSE)

> BSV 编码知识引擎 — Your Bluespec coding mate.

[🇬🇧 English Version](./README.en.md)

`specmate` 是一个 **BSV 编码知识引擎**——为 AI Agent 植入 Bluespec SystemVerilog 领域的知识层。内置错题本（9 条错误、自动计数）、规范文档（8 篇速查）、设计模式（7 个生产级范式）、4,570 个官方用例。帮助 Agent 写出一次编译通过的 BSV 代码。

BSV 是冷门硬件描述语言，AI 训练数据停留在旧版本，编写代码很难一次编译成功。这个项目将编译错误经验积累为知识库，通过 MCP 协议让 Agent 在编写时就规避常见问题。

| 特性 | 说明 | MCP 工具 |
|------|------|----------|
| **📋 编码硬约束** | SQLite 驱动，按命中次数排序的编码规则，随错误积累自动演进 | `coding_rules` |
| **🚀 编码前速览** | 写代码前看一眼高频错误 + 设计警告，避免踩坑 | `preflight` |
| **🔍 编译前静态检查** | 文本正则检测 rule/method 顺序、Bool 误用、SV 保留字冲突、`vec()` 陷阱、寄存器重复写入 | `check_style` |
| **📚 错题本** | 9 条真实编译错误，含现象、原因、解决方案；命中自动 +1 | `lookup_error` |
| **📖 BSV 规范参考** | 模块语法、类型系统、常见模式与陷阱 | `lookup_ref` |
| **🔎 官方用例搜索** | 4,570 个 BSC 测试套件 `.bsv`，按关键词搜索正确写法 | `lookup_example` |
| **✍️ 错误自动追加** | 遇到新错误直接调工具入库，无需手写 Markdown | `add_error` |
| **🎛️ 三级能力等级** | `silicon` / `wafer` / `tapeout` 控制返回信息量，适配不同开发场景 | `SPECMATE_LEVEL` |
| **📦 零配置安装** | `npm install -g` 一行装好，配置一句 JSON | — |
| **💾 数据持久化** | SQLite 知识库存 `~/.specmate/`，`SPECMATE_DATA` 自定义路径 | — |

- 🚀 [快速开始](#-快速开始)
- 🛠 [本地开发](#-本地开发)
- 📖 [详细教程 → docs/TUTORIAL.md](./docs/TUTORIAL.md)
- 🇬🇧 [English → README.en.md](./README.en.md)

---

## 🧪 对照实验

用 OpenCode 跑了对照实验——两个 Agent 同时写 Wishbone 总线仲裁器，A 不用 specmate，B 用 specmate。

| 指标 | Agent A（不用 specmate）| Agent B（使用 specmate）|
|------|---------------------|---------------------|
| 编译修复轮数 | **2** | **1** |
| 自陷错误 | `vec()` 未绑定（Vector 设计过复杂导致）| 无 |
| 设计风格 | Vector + Wire（复杂，带风险）| 扁平 Reg（保守，安全）|
| 发现新错误 | `priority`（SV 保留字）+ `vec()` | `priority`（SV 保留字）|
| 知识库增长 | 新增 2 条 | 新增 1 条 |

**结论**：specmate 引导的 Agent 编译轮数减半，且选择了更安全的整体设计风格。两个新错误均已入库，下一轮实验差距会更大。

---

## ⚡ 快速开始

### 安装

```bash
npm install -g specmate
```

### 配置 Claude Code

项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "specmate": {
      "command": "npx",
      "args": ["specmate"]
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

| Level | 场景 | `coding_rules` | `preflight` | `check_style` | `lookup_example` |
|-------|------|---------------|-------------|---------------|------------------|
| **`silicon`** | 轻量速览 / 小修改 | 5 条规则 | TOP 3 错误 | 仅 error | 1 文件 / 15 行 |
| **`wafer`** (默认) | 日常开发 | 8 条规则 | TOP 5 + 3 警告 | error + warning | 3 文件 / 30 行 |
| **`tapeout`** | 深度审查 / 新模块 | 20 条规则 | TOP 10 + 全部警告 + 编码建议 | 全部 | 5 文件 / 50 行 |

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
│       ├── lookup_error.mjs    ← 错题本查询
│       ├── lookup_ref.mjs      ← 规范文档查询
│       ├── lookup_example.mjs  ← 官方用例搜索
│       └── add_error.mjs       ← 追加新错误
├── data/
│   └── knowledge.db       ← 预置种子数据库 (9 条错误)
├── docs/
│   ├── BSV-STYLE.md       ← BSV 编码规范总则
│   ├── checklist.md       ← 编译前检查清单
│   ├── TUTORIAL.md        ← 详细教程
│   ├── errors/            ← 错误原文 (9 条)
│   └── reference/         ← BSV 语法参考 (4 篇)
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

说实话——目前大部分 AI Agent 并不会主动调用 specmate。
它能写出正确的 BSV 代码，不代表它会想起"我可以查一下规范试试"。

我们正在尝试各种方式让 specmate 更自然地融入 Agent 的工作流：
交叉引用、场景建议、`suggest` 工具……但这事还没完美解决 😅

我们刻意不在 AGENTS.md 中写"每个模块写完必须调用 check_style"这种话——
今天的对照实验里试过了：写得太像 checklist，Agent 会逐条汇报"P0005 ✓、P0032 ✓"，
代码输出裹在一堆自检清单里，反而污染了对话。这也是为什么今天我们来回调整了
半天模板——找到一个"够有用又不烦人"的平衡点，比想象中难得多。

**在它完美之前**，如果你发现 Agent 写了一轮又一轮，
没碰过一次 specmate 工具，可以试试在对话里加上一句——

```
如果遇到不确定的 BSV 语法，可以试试 specmate 的 lookup_ref(topic="xxx") 哦 🧠
```

（这就是我们说的"轻轻戳一下"——不是重新发提示词，就是顺着对话多说一句提醒。
Agent 有时候只是忘了自己工具箱里还有这些东西。）

同样的"戳法"也适用于特定场景：

- Agent 卡在 G0004 反复修不动 → 说一句 "试试 lookup_ref(topic=\"schedule\") 看看调度注解？"
- Agent 不确定某个标准库的用法 → 说一句 "要不要查一下 lookup_ref(topic=\"stdlib\")？"
- Agent 写完代码没做检查 → 说一句 "check_style 看一下？"

一行字，可能就少了一轮编译报错。🤏

（如果你发现了更好的"戳"法，欢迎 PR——说不定比我们的高明 😄）

---

## 📄 许可证

MIT
