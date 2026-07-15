# specmate 新手指南

> 第一次用 specmate？这篇就是给你准备的。假设你没用过 specmate、没配过 MCP——看完这篇，15 分钟从零到跑通。

---

## 1. 这是什么

**specmate 是一个帮你写 BSV 代码时少踩坑的知识引擎。**

具体来说，它做三件事：
- **写代码之前**：告诉你这个任务容易在哪些地方翻车（比如 `function` 是保留字，别当变量名用）
- **编译失败之后**：不是你一个人在对着编译错误发呆——specmate 知道 P0005/G0004/G0010 这些错误码背后的根因，并且告诉你具体怎么修（before/after 级别）
- **修好之后**：把这次踩坑的经验存进数据库。下次同一个错误码、同一个人（或不同人）再遇到，主动提醒"这个坑之前踩过 47 次，上次是这么修的"

**specmate 不是编译器。bsc 告诉你怎么错了，specmate 告诉你为什么错了、怎么修。** 把它想象成坐在你旁边的 BSV 老工程师——话不多，但说的都是关键。

关键词：**BSV**、**MCP**、**AI Agent**、**编码记忆**

---

## 2. 前置条件

### 2.1 你需要有这些

| 东西 | 版本要求 | 检查命令 |
|------|---------|---------|
| Node.js | >= 18 | `node -v` |
| bsc 编译器 | BSC 2025.07 | `bsc -v` |
| Git | 任意 | `git --version` |

### 2.2 Claude Code（或其他支持 MCP 的 Agent）

specmate 通过 **MCP**（Model Context Protocol）协议和 AI Agent 交互。MCP 就像一个插件系统——Agent 装上 specmate 这个插件后，就能在写 BSV 代码时调用它。

推荐用 [Claude Code](https://claude.ai/code)（简称 CCB）。其他支持 MCP 的 Agent 也可以用，但目前只在 CCB 上有完整的测试。

如果你没用过 MCP：不用担心，它就是两行 JSON 配置的事情。下面会手把手教你配。

---

## 3. 安装

### 3.1 克隆仓库

```bash
git clone https://github.com/Alele496/bsv-specmate.git
cd bsv-specmate
```

### 3.2 安装依赖

```bash
npm install
```

### 3.3 初始化知识库

```bash
npm run db:seed
```

这一行会从 `docs/errors/` 目录读取 26 条错误知识，生成 `~/.specmate/data/knowledge.db` 数据库。正常的话你会看到类似这样的输出：

```
  + P0005: 标识符与 BSV/SV 保留字冲突
  + G0004: Rule 内并行写冲突
  + G0010: 跨 rule 方法调用冲突
  ...（共 26 条）
26/26 errors written to ~/.specmate/data/knowledge.db
```

> **注意**：从 `v0.1.0` 开始，specmate 启动时会**自动检测并初始化空数据库**。`npm run db:seed` 仍然保留，用作手动重建（比如更新了 docs/errors 后）。但如果数据库已经存在且有数据，它不会覆盖。

### 3.4 验证安装

```bash
npm test
```

应该看到所有测试通过。当前烟雾测试 11 条用例，61 项检查全部通过。

---

## 4. 配置 MCP

这一步让 Agent 知道 specmate 的存在。在你的**项目根目录**创建一个 `.mcp.json` 文件：

```json
{
  "mcpServers": {
    "bsv-specmate": {
      "command": "node",
      "args": ["D:/Desktop/bsv-agent/bsv-agent-server/bin/server.mjs"],
      "env": {
        "SPECMATE_LEVEL": "develop"
      }
    }
  }
}
```

**注意三点**：
1. `args` 里的路径必须是**绝对路径**。把上面例子的路径换成你 clone 仓库的位置。Windows 用正斜杠——`D:/path/to/bin/server.mjs`，不是 `D:\path\to\...`。
2. `SPECMATE_LEVEL` 有三个选项：`verify`（不说话，Agent 问才答）、`develop`（默认，编码前主动提醒陷阱）、`tapeout`（全量守护，交付前用）。新手用 `develop` 就行。
3. 传输模式默认是 stdio——Claude Code 会自动启动和关闭 specmate 进程，你不需要手动启动。

配置完，重启 Claude Code（关闭并重新打开你的项目目录）。Agent 就会自动发现 specmate 的 7 个 MCP 工具。

> **验证 MCP 是否生效**：打开 Claude Code 对话，输入 `mcp__bsv-specmate__specmate_scan task="test"`，如果返回内容说明配置成功。

---

## 5. 第一次使用

现在 specmate 已经在 Agent 的工具箱里了。但 Agent **不知道什么时候该用它**——你需要告诉它。最简单的方式是给 Agent 一份使用指令。

### 5.1 给你的 Agent 一份指令模板

在你的项目根目录创建 `AGENTS.md`，贴上以下内容：

```markdown
# BSV 编码规范 + specmate 使用

## 开始编码前
先用 MCP 工具 specmate_scan 扫描你的任务，了解设计陷阱和硬约束：
specmate_scan({ task: "你的任务描述" })

## 写完代码后
用 specmate_check 做编译前静态检查（注意用绝对路径）：
specmate_check({ files: ["<你的项目路径>/bsv/Top.bsv"], full: true })

## 编译失败时
用 specmate_guide 诊断错误，然后用 specmate_resolve 固化修复经验：
1. specmate_guide({ phase: "on_error", input: "<bsc 错误输出>" })
2. 按诊断结果修复代码
3. specmate_resolve({ code: "错误码", cause: "根因", solution: "修复方案" })

## 不确定语法或结构时
用 specmate_analyze 做深度分析：
specmate_analyze({ files: ["绝对路径"], question: "调度冲突分析" })
```

> 完整的 Agent 指令模板参见 `examples/templates/AGENTS.md`。bench 平台用的 Agent B 模板在 `specmate_bench/templates/agents-autonomous.md`，可以作为参考。

### 5.2 让 Agent 写一个简单 BSV 模块试试

这里有一个简单的测试流程：

1. 把 `AGENTS.md` 放到你的 BSV 项目根目录
2. 打开 Claude Code，跟 Agent 说："帮我写一个 BSV 模块 `mkBlinker`，每秒翻转一次输出 LED。"
3. 观察 Agent 的行为：

| 步骤 | Agent 应该做什么 | 哪些 specmate 工具参与 |
|------|-----------------|----------------------|
| 编码前 | 调 `specmate_scan` 了解陷阱（如时钟分频要用 Counter 不用 #delay） | `specmate_scan` |
| 编码 | 自己写代码，注意 specmate 的提醒 | — |
| 编码后 | 调 `specmate_check` 静态检查代码 | `specmate_check` |
| 编译 | 跑 `bsc -u -verilog ...` | — |
| 编译失败 | `specmate_capture` 记录错误 → 按诊断修复 → `specmate_resolve` 固化 | `specmate_capture` + `specmate_guide` + `specmate_resolve` |
| 编译通过 | 完成 | 可选：`specmate_diff` 追踪 warning |

### 5.3 如果 Agent 不调 specmate 怎么办

这是最常见的坑——第一场实验里 Agent B 全程 0 次调 specmate，不是工具不好，是它不知道有 mate。

**解决方法（按推荐顺序）**：
1. **在对话里直接提醒**："你编完码后先调 specmate_check 静态检查一下，再编译。" 屡试不爽。
2. **把 AGENTS.md 放项目根目录**——Claude Code 会自动加载 `AGENTS.md` 作为系统指令。
3. **把 specmate 指令写进你的 prompt**（见上方的 AGENTS.md 模板）。Agent 每次对话都看到。
4. **调整 SPECMATE_LEVEL**：`develop` 模式下，Agent 调 `specmate_guide` 时 specmate 会主动推送陷阱——Agent 能看到。`tapeout` 模式推得更猛。但如果 Agent **完全不调** specmate，改 level 也没用——它连触发推送的入口都不走。

---

## 6. 工作流速查

| 你在做什么 | Agent 应该调哪个 | 一句话描述 |
|-----------|-----------------|-----------|
| 刚接到任务，准备写代码 | **`specmate_scan`** ⭐ | 任务扫描：陷阱 + 设计决策 + AST 预检 |
| 代码写完了，准备编译 | **`specmate_check`** | 静态检查：位宽溢出、Bool 误用、always_ready 滥用 |
| bsc 编译报了一堆红 | **`specmate_capture`** → 修复 → **`specmate_resolve`** | 记录错误 → 诊断 → 修复 → 固化经验 |
| 错误码不认识 | **`specmate_guide`** (on_error) | 查根因和修复方案（before/after 级别） |
| 两个方案拿不准 | **`specmate_guide`** (decide) | 设计抉择：mkFIFO vs mkBypassFIFO 等 |
| 代码结构复杂，想理解调度 | **`specmate_analyze`** | 深度 AST 分析：调度冲突、依赖图、寄存器读写 |
| 编译过了但 warning 越修越多 | **`specmate_diff`** | snapshot 存基线 → 修复 → diff 对比变化 |

**编码流水线（一句话版）**：
```
specmate_scan → 写代码 → specmate_check → 编译 → 报错就 capture → guide → 修复 → resolve
```

---

## 7. 常见问题

### Q: Agent 完全不调 specmate

**A:** 这是最常见的。在对话里直接说"写代码前先调一下 specmate_scan，写完后调 specmate_check"。如果还不行，把 [Agent 集成手册](docs/agent-integration.md) 的内容贴进对话——这是写给 Agent 看的指令。

### Q: MCP 工具调用报 "文件不存在" 或返回空

**A:** 99% 是路径问题。MCP 工具需要**绝对路径**。不要传 `"SpiMaster.bsv"`，传 `"<你的项目路径>/SpiMaster.bsv"`。Windows 路径用正斜杠。从 `3d8b891` 开始，传入相对路径会返回明确错误提示，不再是静默失败。

### Q: 数据库是空的 / 提示找不到错误码

**A:** 运行 `npm run db:seed` 从 Markdown 文档重建数据库。正常启动 specmate 时也会自动检测并填充空库。如果数据库在 `~/.specmate/` 下，确认该目录可写。

### Q: specmate_scan 什么都没返回 / 返回很空

**A:** 任务描述太模糊，关键词没命中。写具体一些——比如不是"写一个模块"，而是"写一个 SPI 主控制器，支持 CPHA=1 CPOL=1，SCK 10MHz"。关键词越丰富，陷阱匹配越精准。

### Q: specmate 和 bsc 都报同一个错误，specmate 有什么不同？

**A:** bsc 报"P0005: function is reserved word"——你知道了什么错了，不知道怎么修。specmate 告诉你"function 是 Verilog-2001 保留字，genWith 回调用 `\\== (1)` 部分应用替代 `function(...) ... endfunction`"，附带 before/after 代码示例。bsc 是判分器，specmate 是家教。

### Q: SPECMATE_LEVEL 怎么选？

**A:** 日常开发用 `develop`（默认）。快速迭代、想少被打扰用 `verify`。交付前做全面检查用 `tapeout`。实验数据显示话最少的模式盲审得分最高（96.5/100）——不是推送越多越好，是**在正确时机说正确的话**。

### Q: specmate 推送来的陷阱太多，干扰我的思路

**A:** specmate 会根据你的任务描述自动推断你处于 design（架构）还是 code（编码）阶段，只推相关陷阱。如果你说"写 SPI 控制器"→ 推架构级陷阱（FIFO选型、跨时钟域）。你说"写 method 实现"→ 推语法陷阱（Bool/Bit区分、method顺序）。如果你发现推送的阶段不对，任务描述写得更具体一点。

### Q: `npx specmate scan` 命令能用吗？

**A:** 能用——CLI 是给**人类开发者**手动调试用的。但你如果用 Agent（Claude Code），应该让 Agent 走 MCP 调用，不要用 `npx specmate`。MCP 和 CLI 走的是不同的代码路径，MCP 返回结构化结果，Agent 理解得更好。从 `3d8b891` 开始，NEXT STEPS 输出也不会再推荐 CLI 命令——全改为 MCP 格式。

### Q: 我想了解 specmate 的内部架构

**A:** 看 `docs/internal-overview.md`——每阶段更新一次的技术架构总览。还有 `docs/architecture.md`——2026-07-12 确定的架构决策文档（写后不改）。这些是给项目维护者看的，不要求新手了解。

---

## 8. 下一步

- **深入了解每个 MCP 工具**：看 [Agent 集成手册](docs/agent-integration.md)（写给 Agent 看的，但你也可以快速扫一眼了解每个工具的输入输出）
- **跑一场 bench 实验**：看你自己的 BSV 任务在带/不带 specmate 时有多大差别。看 `specmate_bench/CLAUDE.md`
- **贡献错误知识**：你的 Agent 遇到了没收录的错误码？用 `specmate_capture` 记录，修好后 `specmate_resolve` 固化。这是 specmate "越用越强"的根基。
