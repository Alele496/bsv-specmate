# specmate

[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-specmate-red?style=flat-square&logo=npm)](https://www.npmjs.com/package/specmate)
[![GitHub License](https://img.shields.io/github/license/<user>/bsv-specmate?style=flat-square)](https://github.com/<user>/bsv-specmate/blob/main/LICENSE)

> Your Bluespec coding mate.

`specmate` 是一个 BSV（Bluespec SystemVerilog）编码辅助 MCP Server。内置错题本、规范文档、4,570 个官方用例，帮助 AI Agent 编写能一次编译通过的 BSV 代码。

BSV 是冷门硬件描述语言，AI 训练数据停留在旧版本，编写代码很难一次编译成功。这个项目将编译错误经验积累为知识库，通过 MCP 协议让 Agent 在编写时就规避常见问题。

| 特性 | 说明 | MCP 工具 |
|------|------|----------|
| **🔍 编译前静态检查** | 检测 rule/method 顺序、Bool 误用 `~`、SV 保留字冲突、寄存器重复写入 | `check_style` |
| **📚 错题本** | 8 条真实编译错误，含现象、原因、解决方案；命中自动 +1 | `lookup_error` |
| **📖 BSV 规范参考** | 模块语法、类型系统、常见模式与陷阱 | `lookup_ref` |
| **🔎 官方用例搜索** | 4,570 个 BSC 测试套件 `.bsv`，按关键词搜索正确写法 | `lookup_example` |
| **✍️ 错误自动追加** | 遇到新错误直接调工具入库，无需手写 Markdown | `add_error` |
| **📦 零配置安装** | `npm install -g` 一行装好，配置一句 JSON | — |
| **💾 数据持久化** | SQLite 知识库存 `~/.specmate/`，`SPECMATE_DATA` 自定义路径 | — |

- 🚀 [快速开始](#-快速开始)
- 🛠 [本地开发](#-本地开发)
- 📖 [详细教程 → docs/TUTORIAL.md](./docs/TUTORIAL.md)

---

## ⚡ 快速开始

### 安装

```bash
npm install -g specmate
```

### 配置 Claude Code

在项目根目录创建 `.mcp.json` 或在全局配置中添加：

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
  "mcpServers": {
    "specmate": {
      "command": "npx",
      "args": ["specmate"]
    }
  }
}
```

配置后重启 AI 客户端，Agent 会自动发现 5 个 MCP 工具：`check_style`、`lookup_error`、`lookup_ref`、`lookup_example`、`add_error`。

---

## 🛠 本地开发

### 环境要求

- [Node.js](https://nodejs.org/) >= 18

```bash
git clone https://github.com/<user>/bsv-specmate.git
cd bsv-specmate
npm install
node bin/server.mjs
```

### IDE 开发配置

直接指向本地路径，无需每次发布 npm：

```json
{
  "mcpServers": {
    "specmate": {
      "command": "node",
      "args": ["<项目绝对路径>/bin/server.mjs"]
    }
  }
}
```

---

## 📂 项目结构

```
bsv-specmate/
├── AGENTS.md              ← Agent 使用手册（独立/协作两种模式）
├── README.md              ← 你正在读的文件
├── package.json
├── bin/
│   └── server.mjs         ← MCP Server 入口，注册 5 个工具
├── src/
│   ├── config.mjs         ← 路径解析 + 首次初始化
│   ├── db/
│   │   ├── schema.mjs     ← SQLite 表结构
│   │   ├── seed.mjs       ← Markdown → SQLite
│   │   ├── export.mjs     ← SQLite → Markdown
│   │   └── query.mjs      ← 数据库查询封装
│   └── tools/
│       ├── check_style.mjs      ← 编译前静态检查
│       ├── lookup_error.mjs     ← 错题本查询
│       ├── lookup_ref.mjs       ← 规范文档查询
│       ├── lookup_example.mjs   ← 官方用例搜索
│       └── add_error.mjs        ← 追加新错误
├── data/
│   └── knowledge.db       ← 预置种子数据库 (8 条错误)
├── docs/
│   ├── BSV-STYLE.md       ← BSV 编码规范总则
│   ├── checklist.md       ← 编译前检查清单
│   ├── TUTORIAL.md        ← 详细教程
│   ├── errors/            ← 错误原文 (8 条)
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

通过环境变量自定义路径：

```json
{
  "mcpServers": {
    "specmate": {
      "command": "npx",
      "args": ["specmate"],
      "env": {
        "SPECMATE_DATA": "D:/my-bsv-data"
      }
    }
  }
}
```

---

## 🤝 贡献

1. 遇到新的 BSV 编译错误 → Agent 通过 `add_error` 工具入库
2. `npm run db:export` 导出 Markdown
3. 提交 PR 将新错误合并回主仓库

---

## 📄 许可证

MIT
