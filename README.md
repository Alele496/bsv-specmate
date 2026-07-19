<div align="center">

# specmate 🤝

[![npm version](https://img.shields.io/npm/v/bsv-specmate?style=flat-square)](https://www.npmjs.com/package/bsv-specmate)
[![CI](https://github.com/Alele496/bsv-specmate/actions/workflows/knowledge-qa.yml/badge.svg)](https://github.com/Alele496/bsv-specmate/actions/workflows/knowledge-qa.yml)
[![License](https://img.shields.io/github/license/Alele496/bsv-specmate?style=flat-square)](https://github.com/Alele496/bsv-specmate/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)

> BSV 终于有个 mate 了——一个懂 BSV、记得住你的翻车现场、会在编译前喊你看路的编码搭子。

**[安装](#安装) &bull; [工具](#工具) &bull; [工作流](#工作流) &bull; [效果](#效果) &bull; [状态](#状态) &bull; [结构](#结构) &bull; [文档](#文档)**

</div>

---

<a id="它能做什么"></a>

## 🌟 它能做什么

AI 写 Python 很顺手。写 BSV？一编译满屏红——不是 AI 笨，是 BSV 太冷门，训练数据全是老版本。specmate 不替 Agent 写代码，它在 Agent 落笔之前先把坑指出来。

- **陷阱预测** — 你做 FIFO pipeline？上一个 Agent 在这翻了三次，我给你标出来。基于 30 个领域知识图谱节点，提前扫雷。
- **静态检查** — 19 条规则扫一遍 `.bsv`，方法顺序、Bool 运算符误用、SV 保留字冲突、字面量溢出。不调 bsc，秒出结果。
- **错误诊断** — 把 BSC 那满屏红丢进来，29 篇编码记忆逐一比对，告诉你根因和怎么修。不认识的新错误？自动入库记下来。
- **记仇的 code buddy** — 编译报错 → capture 记一笔 → 修好 → resolve 归档。SQLite 驱动，每次命中自动 +1。同一条坑不踩两次——它真记仇。
- **代码审查** — tree-sitter 真解析 BSV 语法树，不是正则匹配。调度冲突矩阵、跨 rule 冲突、依赖图——给你画出来。

---

<a id="安装"></a>

## 🚀 快速开始

### 安装

```bash
npm install -g bsv-specmate
```

需要 Node.js >= 18。

### 配置 MCP

在 BSV 项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "bsv-specmate": {
      "command": "npx",
      "args": ["bsv-specmate"]
    }
  }
}
```

启动 AI 客户端（Claude Code / OpenCode 等），Agent 自动发现 specmate 工具。

> 📡 **通过 MCP Registry 发现**：specmate 已注册到 [MCP Registry](https://github.com/modelcontextprotocol/servers)（`Developer Tools` 类别）。在支持 Registry 的客户端中，可通过 `mcp add bsv-specmate` 一键安装，无需手动编写配置文件。

> 🎚️ **三级干预强度**：
>
> | 模式 | 行为 |
> |------|------|
> | `verify` 社恐模式 | 零推送，默默旁观。code review 定稿前再出声 |
> | `develop` 日常模式（默认） | 编码前主动推送陷阱，该提醒的时候绝不含糊 |
> | `tapeout` 话痨模式 | 全量守护，交付前不留死角，每个检查项都过一遍 |

### 验证

让 Agent 写一段 BSV 代码，specmate 会自动介入。有返回结果就说明配置成功。详细步骤和常见问题见 [新手指南](docs/getting-started.md)。

---

<a id="工具"></a>

## 🔧 MCP 工具一览

specmate 通过 8 个 MCP 工具供 AI Agent 调用。

| 工具 | 用途 | 何时调用 |
|------|------|---------|
| **`specmate_scan`** ⭐ | 统一入口：陷阱预测 + AST 预扫描 + 设计建议 | 拿到新任务时，编码前 |
| **`specmate_check`** | 19 条规则静态扫描 `.bsv` 文件 | 写完一段代码后，编译前 |
| **`specmate_diagnose`** | 传入完整 BSC 编译输出，批量诊断所有错误 | 编译结果一屏幕红 |
| **`specmate_capture`** | 解析 BSC 编译错误，入库新知识 | 编译报错时 |
| **`specmate_resolve`** | 固化修复方案，标记错误已解决 | 错误修好之后 |
| **`specmate_analyze`** | tree-sitter 深度解析 BSV 语法树 | 排查调度冲突、依赖问题时 |
| **`specmate_diff`** | 对比编译结果快照，追踪 warning 变化 | 重构后对比编译变化 |
| **`specmate_guide`** | 分阶段指导（pre_code / on_error / continue / decide / pattern） | 需要分步引导时 |

`specmate_scan` 是推荐统一入口，替代旧的多次分步调用。完整集成说明（AGENTS.md 模板、OpenCode 配置、角色提示词）见 [Agent 集成手册](docs/agent-integration.md)。

---

<a id="工作流"></a>

## 📋 Agent 工作流

```
拿到 BSV 任务
  │
  ├─ specmate_scan({ task: "你的任务" })
  │   └→ 陷阱预测 + 设计建议 + 推荐范式
  │
  ├─ 写代码
  │
  ├─ specmate_check({ files: ["绝对路径/文件.bsv"] })
  │   └→ 19 条规则快速扫描
  │
  ├─ bsc 编译
  │   ├─ 通过 → specmate_resolve 固化经验 ✅
  │   └─ 报错 → specmate_diagnose 诊断 + specmate_capture 捕获
  │       └→ 修复 → 回到编译 → 通过 → resolve ✅
```

> **Agent 不知道 specmate？你不是第一个。** 第一场实验里 Agent 全程 0 次调 specmate——不是工具不好，是它不知道有这个 mate。在对话里说一句"试试用 `specmate_scan` 扫一下你的任务"就够了。

---

<a id="效果"></a>

## 📊 效果速览

不是随口说的——我们做了五场对照实验。Agent 完成同一个 BSV 项目，唯一区别是带了 specmate 还是裸写。

第一场，Agent 连 specmate 都不知道存在，全程 0 次调用——问题不在工具，在 Agent 不认识这个 mate。第二场 Agent 开始主动调用了，但时机不对——写完代码才 scan，等于考试交卷了才看复习笔记。第三场我们拉了不认识双方的 Agent 做双盲评审——带 specmate 的方案代码质量盲审高出 16%，评审人不知道哪份是谁写的。第四场优化了模板约束，首次编译通过率显著提高。第五场聚焦审查角色——最有效的不是堆更多规则，而是给 Agent 一个审查角色，让它知道该在什么时候调哪个工具。

核心结论：specmate 的价值不是替 Agent 写代码，而是替 Agent 记住那些它学一次忘一次的 BSV 冷知识。

> 完整数据、实验设计和方法论分析见 **[SHOWDOWN 报告](docs/SHOWDOWN.md)**。

---

<a id="状态"></a>

## 📈 当前状态

- 版本 0.1.1，已发布到 npm（`npm install -g bsv-specmate`）
- 8 个 MCP 工具全部可用，CI 自动化验证
- 12 条 BSV 陷阱已验证（fixture 文件 + bsc 编译双重验证），62 条 backlog 按天推进
- 29 篇编码记忆覆盖常见 BSC 编译错误
- 30 个领域知识图谱节点，19 条静态检查规则
- pre-commit hook 拦截 + GitHub Actions CI 双保险

---

<a id="结构"></a>

## 📂 项目结构

```
specmate/
├── bin/                  # MCP 服务器入口（stdio / HTTP）
├── src/
│   ├── tools/            # 8 个 MCP 工具实现
│   ├── db/               # SQLite 知识库持久化
│   └── config.mjs        # SPECMATE_LEVEL 配置
├── docs/
│   ├── errors/           # 29 篇编码记忆
│   └── traps/            # 已验证陷阱文档
├── test/fixtures/        # 每条规则对应 pass.bsv + fail.bsv
└── examples/             # BSV 示例代码
```

核心思路：MCP 工具层承接 Agent 调用 → 知识图谱做匹配 → SQLite 持久化经验。代码量不大，重在知识积累。

---

<a id="文档"></a>

## 📖 文档

- **第一次用？** 读 [新手指南](docs/getting-started.md) — 安装、配置、三步走完。
- **接入 Agent？** 读 [Agent 集成手册](docs/agent-integration.md) — AGENTS.md 模板、OpenCode 配置、角色提示词。
- **想了解设计？** 读 [架构文档](docs/architecture.md) — 设计决策、模块关系、数据流。
- **想看数据？** 读 [SHOWDOWN 报告](docs/SHOWDOWN.md) — 五场对照实验完整设计和分析。
- **深入源码？** 读 [内部总览](docs/internal-overview.md) — 源码结构、数据库 schema、工具实现细节。

---

<a id="贡献"></a>

## 🤝 贡献

specmate 的知识来自实战踩坑。你遇到 bsc 报错了，Agent 用 `specmate_diagnose` 诊断 → `specmate_capture` 记下来 → 修好以后 `specmate_resolve` 固化 → 补一篇文档说清根因和修复方案。每条知识都让下一个写 BSV 的人少踩一个坑。

欢迎提 Issue 和 PR。规则和陷阱的 fixture 贡献尤其欢迎。fixture 是什么？每条检查规则配两个 `.bsv` 文件——`pass.bsv` 是通过用例（写对了不该报），`fail.bsv` 是失败用例（故意触发规则应该报）。新增规则时跑 `node test/fixtures/run-fixtures.mjs` 验证全部 fixture，不通过不能合并——这是议会定的铁律，谁来都一样。具体目录结构和示例看 `test/fixtures/check/` 下面已有的规则。

---

## 🔗 相关项目

- **[Kova](https://github.com/Alele496/kova)** — DKE 领域知识引擎框架，specmate 是它的第一个 BSV 实例
- **[bsc](https://github.com/B-Lang-org/bsc)** — Bluespec 官方编译器，specmate 的 knowledge base 依赖 bsc 的编译输出来积累经验
- **[bsc-contrib](https://github.com/B-Lang-org/bsc-contrib)** — Bluespec 社区库和工具集，写 BSV 时常配合使用

---

> MIT License | [Alele496](https://github.com/Alele496)
