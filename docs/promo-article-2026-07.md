# AI 写硬件的一手体验：我们做了五场对照实验，发现 BSV 编译失败不是因为 AI 笨

> specmate v0.1.1 正式发布。一个会记仇的 BSV 编码搭子，npm 一行命令就能用。

---

AI 写 Python 很顺手。Python 语法简单、训练数据充足、StackOverflow 上什么都有。

写 BSV 就不是这么回事了。

BSV（Bluespec SystemVerilog）是一种硬件描述语言，用在 FPGA 和 ASIC 设计里。它的核心是 Guarded Atomic Actions——你定义模块的行为约束，编译器自动推导调度逻辑。这个范式很强大，但 LLM 的训练数据里 BSV 几乎是噪声级别。我们做过统计：某主流模型的代码训练集中，BSV 占比不到 0.001%。

结果就是：你用 AI 写一段 200 行的 BSV 模块，十个 Agent 里有九个第一次编译全屏红。不是 Agent 笨——是它脑子里压根没有你用的这个版本的 BSV。

更头疼的是：Agent A 在这踩了一个坑，修好了。Agent B 换个 session 过来，原样再踩一遍。知识不传递。

**specmate 就是来解决这个问题的。**

---

## 它不是编译器，是"编译前看路的人"

先说清楚 specmate 是什么、不是什么。

- ✅ 是一个 **BSV 编码知识引擎**——基于 30 个领域知识图谱节点，在 AI 写代码之前就标出潜在陷阱
- ✅ 是一个 **MCP 服务器**——8 个工具，任何 MCP 客户端都能调用（Claude Code、Cursor、OpenCode）
- ✅ 是一个 **越用越强的知识库**——每次踩坑都存入 SQLite，下次同样的错误码自动提醒
- ❌ 不是编译器——它不替代 bsc，也不替你编译。但下一次更新会支持 opt-in 编译集成（下面会说）

怎么用？一行命令：

```bash
npm install -g bsv-specmate
```

然后在项目根目录放一个 `.mcp.json`：

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

Agent 自动发现 specmate，你写你的代码就行。

---

## 五场实验，一件事越来越清楚

我们不是张嘴就说好——做了五场对照实验。同一个 BSV 项目，只有"带 specmate"和"不带 specmate"这一个变量。

**第一场**：Agent 压根不知道 specmate 存在，全程 0 次调用。不是工具不好，是它不知道有这么个 mate。在对话里说一句"试试用 specmate_scan 扫一下你的任务"就够了。

**第二场**：Agent 开始调用了，但时机全错。写完代码才 scan——等于考试交卷了再看复习笔记。

**第三场**：双盲评审。拉了一个不认识双方的 Agent 做代码质量盲审，带 specmate 的方案高出 16%。评审人不知道哪份是谁写的。

**第四场**：优化了模板约束。Agent 在编码前就调 specmate_scan，首次编译通过率显著提高。

**第五场**：最关键的发现。不是规则越多越好——最有效的是给 Agent 一个**审查角色**，让它知道什么时候该用什么工具。

五场下来，核心结论就一句话：**specmate 的价值不是替 AI 写代码，是替 AI 记住那些它学一次忘一次的 BSV 冷知识。**

带 specmate 的 Agent 编码时间最高缩短 52%，首次编译通过率从"必炸"变成"大概率过"。

---

## 8 个工具，一个工作流

specmate 覆盖了从"准备写"到"编译报错"到"修好固化"的全周期：

```
拿到任务
  │
  ├─ specmate_scan    → 陷阱预测 + 设计建议
  ├─ 写代码
  ├─ specmate_check   → 19 条规则静态扫描（不跑 bsc，秒出）
  ├─ bsc 编译
  │   ├─ 通过 → specmate_resolve ✅
  │   └─ 报错 → specmate_diagnose → 修复 → resolve ✅
```

| 工具 | 什么时候用 |
|------|-----------|
| `specmate_scan` ⭐ | 拿到新任务，动手前扫一遍 |
| `specmate_check` | 写完代码，编译前过 19 条规则 |
| `specmate_diagnose` | bsc 一屏幕红，一次调用全量诊断 |
| `specmate_capture` | 编译报错的错误码自动入库 |
| `specmate_resolve` | 修好后固化根因和方案 |
| `specmate_analyze` | 调度冲突、依赖图，tree-sitter 画出来 |
| `specmate_diff` | 追踪重构前后的 warning 变化 |
| `specmate_guide` | 按阶段分步指导 |

还有一个好玩的设定：specmate 有三级"话多程度"——

| 模式 | 行为 |
|------|------|
| `verify` 社恐模式 | 零推送，你不问我不说 |
| `develop` 日常模式 | 编码前主动提醒陷阱 |
| `tapeout` 话痨模式 | 全程守护，每个检查项都过 |

实验数据显示，话最少的模式反而盲审得分最高——不是推送越多越好，是在正确时机说正确的话。

---

## 当前状态

- 📦 npm 已发布：`bsv-specmate@0.1.1`
- 🧠 知识库：29 篇编码记忆 + 12 条已验证陷阱 + 19 条静态规则
- 🧪 测试：113 项全量测试，0 失败
- 🔄 CI/CD：pre-commit hook + GitHub Actions 双保险，打 tag 自动发 npm + GitHub Packages
- 📂 开源：MIT License，[github.com/Alele496/bsv-specmate](https://github.com/Alele496/bsv-specmate)

---

## 接下来

三个方向正在推进：

1. **MCP Elicitation** — 让 specmate 主动问 Agent"你在做架构设计还是编码实现？"推送更精准
2. **BSC 编译集成** — check + compile + diagnose 一步完成，Agent 不用手动跑 bsc
3. **知识自动增长** — 遇到未知 BSC 错误时自动拼装上下文供 LLM 分析，分析结果存回知识库，越用越聪明

核心信念：**哪怕我们不更新了，只要有人在用、在 compile、在 diagnose、在 resolve，specmate 就一直长。**

---

## 参与

踩坑了？欢迎提 Issue。知道怎么修？欢迎提 PR。每条新规则带 `pass.bsv` + `fail.bsv` 就能合并——这是我们的 fixture 铁律。

如果你也写 BSV，试试让 AI Agent 带上 specmate。第一句提示词只需要说：

> "试试用 specmate_scan 扫一下你的任务。"

---

> specmate = spec（规范）+ teammate（队友）。一个帮你少犯低级错误、记住每一次翻车、越用越聪明的编码搭子。
>
> MIT License | [Alele496/bsv-specmate](https://github.com/Alele496/bsv-specmate)
