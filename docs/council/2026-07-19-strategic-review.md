# specmate 战略复盘：三层架构、行业对标与路径选择

> 日期：2026-07-19 | 发起：议会（第三轮战略讨论）
> 背景：用户提出 bsc → specmate → Agent 三层架构构想，要求评估中间层的战略价值和护城河
> 关联文档：`docs/council/2026-07-18-static-check-architecture.md`（议会共识）、`docs/trend-reports/2026-07-18-strategic-analysis.md`（前轮战略分析）

---

## 一、行业现状（基础认知，非本轮重点）

### 1.1 AI 写硬件的玩家格局

本轮 WebSearch 因安全分类器故障未获取实时数据，但基于 7-18 分析结论和已知行业信息，当前格局如下：

| 层级 | 代表玩家 | 方案 | 覆盖语言 | 与 specmate 的关系 |
|------|---------|------|---------|-------------------|
| **芯片物理设计** | Google DeepMind AlphaChip | 强化学习做布局布线 | 不涉及 RTL | 无关 |
| **RTL 代码生成** | NVIDIA ChipNeMo | 微调 LLM 生成 Verilog | Verilog | 竞争维度不同 |
| **通用代码补全** | GitHub Copilot, Cursor | LLM 补全任意语言 | 所有语言（包括 BSV，但质量差） | 互补（specmate 弥补 BSV 专项短板） |
| **HDL Agent** | 开源社区（HDL Agent 等） | LLM + tool-calling 辅助 Verilog/VHDL | Verilog/VHDL | 无 BSV 方向产品 |
| **学术评测** | VerilogEval, RTLLM, BetterV | 评测 LLM 的 HDL 生成能力 | Verilog 为主 | specmate 可成为评测标准 |

**关键结论（与 7-18 分析一致）：specmate 没有直接竞品。** 不是技术壁垒，而是 BSV 市场太小，不值得创业公司或大厂专门做一个产品。这是"利基市场独占"优势。

### 1.2 MCP 协议生态

MCP 已从 Anthropic 专属走向行业标准（OpenAI Agents SDK 2025 年宣布支持，Google Gemini 插件桥接）。2025-2026 关键演进：

- Streamable HTTP 传输标准化（替代旧 SSE）
- MCP Registry 上线（2025.11），社区工具爆发增长
- Elicitation 原语进入草案（服务器反向向客户端请求信息）
- Resource Templates（参数化资源 URI，按需获取）

specmate 当前使用 `@modelcontextprotocol/sdk@^1.9.0`，stdio 传输。8 个 MCP 工具是 Agent 唯一正式通道。

### 1.3 "编译器 + AI + 知识库"集成型项目

在软件工程和硬件设计领域，目前没有发现与 specmate 模式完全对标的产品。最接近的类比是：

- **Rust Analyzer + rustc**：rust-analyzer 不做编译，但提供 IDE 级语义分析。rustc 的错误消息质量极高（有专门的 diagnostics 工作组）。两者配合形成"编辑器辅助 + 编译器权威"的双层结构。但 rust-analyzer 没有"知识引擎"层——它不做设计决策、不知道为什么用 `Arc` 而不是 `Rc`。
- **ESLint + TypeScript**：ESLint 规则中有一部分是 tsc 也会报的（如 no-unused-vars），也有一部分是 tsc 不报的风格/陷阱规则。ESLint 社区维护了大量"tsc 不会告诉你"的规则——这正是 specmate 的静态检查应该聚焦的方向。
- **Clang-Tidy + Clang**：C++ 的静态分析工具，部分规则与编译器警告重叠。Clang-Tidy 额外提供"陷阱规则"（如 modernize-* 系列）。模式接近 specmate，但没有"知识引擎"概念。

**specmate 的独特性不在于"编译器 + 静态检查"，而在于"知识引擎"层——把 BSV 领域经验（traps/decisions/patterns）结构化、可检索、可被 Agent 使用。**

---

## 二、模式对标

### 2.1 软件工程中的"MCP 中间层 + 领域知识引擎"类比

在软件工程领域，有几个与 specmate 模式高度相似的成功案例：

#### 案例 1：ESLint 的规则生态

```
JavaScript 引擎（V8/SpiderMonkey）   ←→  bsc（编译器）
ESLint（静态规则 + 社区插件）        ←→  specmate（检查 + 知识）
开发者 / AI Agent                    ←→  Agent
```

ESLint 的核心价值不是"比 JS 引擎更准地检测语法错误"——JS 引擎检测语法错误的精度是 100%。ESLint 的价值在于：
1. **JS 引擎不会报的东西**：风格规则、最佳实践、反模式、安全陷阱
2. **可扩展的规则生态**：社区贡献的插件（React、TypeScript、安全）
3. **自动修复**：ESLint --fix 直接改代码

**对 specmate 的启示**：议会 7-18 共识已明确——别在规则精度上跟 BSC 较劲。BSC 能精确报告的规则降级为 info，精力投入到 BSC 不报的语义陷阱和设计决策上。这就是 ESLint 的成功路径。

#### 案例 2：Rust 的 Clippy

```
rustc（编译器）      ←→  bsc
Clippy（lint 工具）   ←→  specmate
开发者 / Agent        ←→  Agent
```

Clippy 有 550+ 条 lint 规则，其中大量是 rustc 不会报的。Clippy 的分类方式值得借鉴：
- `correctness`（肯定错）→ specmate 的 high confidence
- `style`（风格偏好）→ specmate 的 medium confidence
- `complexity`（过于复杂）→ specmate 的 low confidence
- `perf`（性能建议）→ specmate 尚无此维度

**对 specmate 的启示**：Clippy 的成功在于"编译器不对这些事发表意见"——这些规则是人类经验的结构化。specmate 的陷阱库（traps）就是 BSV 版的 Clippy lint 规则。

#### 案例 3：GitHub Copilot 的"Workspace Context"转向

Copilot 最初只是代码补全。后来加入了 Workspace Context（读取项目中其他文件）、Knowledge Bases（用户指定的知识源）、Agent Mode（自主规划和执行）。这个演进轨迹值得关注：

```
阶段 1：代码补全（纯 LLM）
    ↓
阶段 2：上下文感知（读取文件 + 导入图）
    ↓
阶段 3：Agent 模式（规划 + 工具调用 + 执行）
```

Copilot 发现了 LLM 原生能力的边界——单文件补全很高，跨文件理解很弱。于是他们加了 Workspace Context。specmate 的定位正是：**Agent 不需要通过读文件来理解 BSV 语义——specmate 直接告诉它**。

### 2.2 IDE 演进历史的启示

```
Text Editor（vi, emacs, Notepad）
    ↓ 1980s-1990s
IDE（Eclipse, Visual Studio, IntelliJ）
    - 语法高亮
    - 代码补全（基于索引，不是 AI）
    - 重构工具
    - 集成的编译/调试
    ↓ 2010s
Language Server Protocol（LSP）
    - 编辑器和语言服务解耦
    - 一个语言服务器服务所有编辑器
    - 关键创新：标准化了"编辑器 ↔ 语言智能"的接口
    ↓ 2020s
AI-native IDE（Cursor, Copilot, Windsurf）
    - LLM 代码补全和生成
    - Agent 模式（自主任务执行）
    - 但 BSV 等小众语言仍然是盲区
```

**这条轨迹对 specmate 的启示有三个层次：**

1. **LSP 的历史类比**：在 LSP 出现之前，每个编辑器要单独实现每种语言的智能（IntelliJ 做 Java、VS 做 C#、Eclipse 做 Java）。LSP 做了一件关键的事：**标准化了编辑器和语言服务之间的协议**。MCP 对 AI Agent 和领域知识工具的关系，就是 LSP 对编辑器和语言服务的关系。specmate 是 BSV 的"MCP 领域服务器"——就像 rust-analyzer 是 Rust 的 LSP 服务器。

2. **从"工具"到"协议"**：LSP 的成功不是因为"工具好用"，而是因为"协议标准化"。一旦 LSP 成为标准，所有编辑器都能用 rust-analyzer，所有 LSP 服务器能服务所有编辑器。同样的逻辑：**MCP 让 specmate 能服务所有 AI Agent（Claude、Gemini、GPT），而不是绑死一个 Agent。**

3. **AI-native IDE 的盲区**：Cursor/Copilot/Windsurf 的 BSV 支持都是"通用 LLM 的附带能力"——不是"为了 BSV 优化的"。这正是 specmate 的切入点：做通用 AI IDE 不做的事。

### 2.3 "知识引擎"在其他领域的对标

"知识引擎"（Knowledge Engine）这个概念在其他领域有成熟的实践：

#### 医疗 AI — 临床决策支持系统（CDSS）

```
医学教科书/论文（原始知识）
       ↓
临床知识图谱（Mayo Clinic, UpToDate）
  - 症状 → 疾病 → 治疗方案
  - 药物相互作用数据库
  - 持续更新（新论文、新药）
       ↓
医生 / AI 诊断辅助
```

与 specmate 的类比：
- BSV 语言参考/编译器源码 = 医学教科书
- specmate traps/decisions/patterns = 临床知识图谱
- Agent（写 BSV）= 医生（诊断和治疗）
- BSC 编译报错 = 化验结果（客观事实，但不解释为什么）

**医疗 AI 的核心洞察**：LLM 可以看医学教科书然后回答问题，但它的幻觉率在医疗领域不可接受。所以医疗 AI 的核心架构是 **LLM + 结构化知识图谱**——LLM 做理解和对话，知识图谱做"地面真相"（ground truth）。specmate 的思路完全一致：Agent（LLM）做代码生成和理解，specmate 做 BSV 的"地面真相"。

#### 法律 AI — 判例库和法律知识图谱

```
法典/法规（原始文本）
       ↓
法律知识图谱（Westlaw, LexisNexis）
  - 判例索引和引用网络
  - 法律条文的司法解释
  - 管辖区差异
       ↓
律师 / AI 法律助手
```

法律 AI 的启示：
- 通用 LLM 在律师资格考试上得分很高，但在真实案例中会"创造不存在的判例"（幻觉）
- 解决方案：**LLM 负责起草和检索，知识图谱负责验证引用是否真实存在**
- specmate 的 `specmate_scan` → `specmate_check` → `bsc` 三层正是这个模式：scan 给知识引导，check 做经验验证，bsc 做事实验证

#### 软件工程 — 内部开发者平台（IDP）

```
云基础设施（AWS/Azure/GCP）
       ↓
内部开发者平台（Backstage, Humanitec）
  - 服务目录
  - 部署模板和最佳实践
  - 合规检查
       ↓
开发者
```

IDP 的核心价值是"**把组织知识从人的脑子里搬到平台里**"——新人不需问老员工"怎么做部署"，平台直接告诉。specmate 的 captures 数据库（编译错误 → 修复经验 → 知识固化）正是同一个逻辑——把 BSV 专家的经验从脑子里搬到 specmate 的知识库里。

---

## 三、三层架构的价值判断

### 3.1 用户提出的三层架构

```
bsc（固定、确定性的编译器）
  ↕
specmate（灵活的中间层，知识引擎）
  ↕
Agent（最灵活，AI 推理和编码）
```

### 3.2 每层的核心能力（不可替代性分析）

| 层 | 核心能力 | bsc 能做吗？ | Agent 能做吗？ | 结论 |
|----|---------|:-----------:|:-------------:|------|
| **bsc** | 编译、类型检查、调度分析、生成 Verilog | ✅ 这就是 bsc | ❌ Agent 无法替代编译器的确定性 | bsc 不可替代 |
| **specmate 知识引擎** | BSV 陷阱库、设计决策、错误根因诊断、代码范式 | ❌ bsc 只报错不解释 | ⚠️ 部分可以，但精度远不如结构化知识 | **核心争议区** |
| **Agent** | 推理、代码生成、任务规划、多文件协调 | ❌ bsc 没有推理能力 | ✅ Agent 的核心能力 | Agent 不可替代 |

**核心争议在中间层**：specmate 提供的知识（traps/decisions/patterns/diagnose），如果 Agent 以后训练数据包含更多 BSV（更懂），或者 bsc 改进错误信息（更友好），中间层还有价值吗？

### 3.3 specmate 中间层的四大独特价值

#### 价值 1：BSV 训练数据的"噪声诅咒"（不会随时间消失）

BSV 用户群体极小（全球估计数百到数千人）。这意味着：
- BSV 代码在 LLM 训练语料中的占比是 ppm 级别（百万分之一）
- 即使 Anthropic/OpenAI 把训练数据翻 10 倍，BSV 仍然是噪声
- AI 公司没有动力为 BSV 优化——ROI 不存在

**这个诅咒不会随时间消失——除非 BSV 突然大规模流行（可能性极低）。** 所以"Agent 以后会自己懂 BSV"是一个伪命题。它会懂 BSV 语法（任何 LLM 都能生成语法正确的 BSV），但不会懂 BSV 语义——"这条 rule 和那条 rule 的隐式冲突"、"这个 FIFO 应该用 PipelineFIFO 而不是 LFIFO"、"G0004 在你当前的设计模式下会出现"。

这正是知识引擎的护城河——**它保护的领域不需要变大，它需要的是领域内知识密度不断加深。**

#### 价值 2：编译器和 AI 之间的"语义鸿沟"（不会消失）

bsc 的输出是给编译器开发者看的，不是给 AI Agent 看的：

```
bsc 输出：Error: "P0030: Multiple uses of same method in parallel"
Agent 的反应：修改 method 调用（可能改错）
specmate 输出："P0030 = pipeline 冲突。你的 rule_a 和 rule_b 调了
             同一个模块的同一 method。解法：(1) 改 schedule annotation
             (2) 插 FIFO (3) 拆分 rule。参考范式 4：流水线冲突消除。"
Agent 的反应：知道三种解法，选最合适的
```

bsc 不可能为每个错误码写三种解法、关联范式、提供陷阱预警——这超出了编译器的职责范围。但这对 Agent 是必需的。**编译器和 AI 之间的"语义鸿沟"是结构性的，不会因 bsc 错误消息改善而消失。**

#### 价值 3：设计决策的"因果链"（越积累越厚）

specmate 的 DECISIONS 表（当前 10 个决策条目）提供的东西 bsc 不可能提供：

- "你应该用 PipelineFIFO 还是 LFIFO？" → bsc 不管这个
- "StmtFSM 还是手写 state register？" → bsc 不管这个
- "跨时钟域应该用 mkSyncFIFO 还是手写同步器？" → bsc 不管这个

这些决策的答案不是从 BSV 语言规范推导的——它们来自实际项目经验（什么选择导致了什么后果）。Agent 的 LLM 可能通过少量 BSV 代码学会"语法上怎么写 PipelineFIFO"，但不知道"在什么场景下不应该用 PipelineFIFO"。

**这套"因果知识"也是越积累越厚的**：每新增一个 trap、每个新捕获的编译错误模式、每增加一个 DECISIONS 条目，都是 bsc 和 Agent 都无法自然获取的知识。

#### 价值 4：MCP 协议层 = "不可绕过的网关"（战略价值）

这是容易被忽视但最重要的价值。一旦 Agent 的工作流被设定为：

```
写文件 → specmate_scan → specmate_check → bsc 编译
```

specmate 就成了 Agent 开发 BSV 的**必经之路**。这不仅是技术选择，更是架构锁定的结果：
- bench scaffold 已将 specmate 嵌入 Agent 的标准 BSV 开发工作流
- Agent 通过 MCP 调 specmate（不是通过 CLI）
- 未来增量功能（Elicitation、Resource Templates、团队共享知识库）都在这个"必经之路"上叠加

**MCP 中间层的战略价值不在于"它做了什么"，而在于"Agent 必须经过它"。** 就像 Nginx 不仅可以做反向代理，还可以做限流、日志、认证——一旦流量经过你，你就有了做任何事的可能性。

### 3.4 如果 bsc 进步了、Agent 更聪明了，中间层还有价值吗？

| 场景 | 受影响的能力 | 还剩下的价值 |
|------|------------|------------|
| bsc 报错信息极度友好 | specmate_diagnose 的根因分析 | DECISIONS、traps、patterns、captures——这些都不是 bsc 的职责 |
| Agent 训练数据包含大量 BSV | "教 Agent BSV 语法" | 设计决策（不能从语法推导）、团队经验（不能从公开代码推导）、预检拦截（比走 bsc 编译快 20 倍） |
| 两者同时发生 | specmate 的"辅助 Agent 写 BSV" | **specmate 的终极形态：团队知识基础设施**——不是教 Agent BSV，而是沉淀你的团队在 BSV 项目中的设计经验和错误教训 |

### 3.5 specmate 的护城河分析

| 能力 | 会随时间消失吗？ | 护城河深度 |
|------|:----------------:|:----------:|
| BSV 语法检查（正则/tree-sitter） | ✅ 会被 bsc/AST 工具替代 | 浅，不应投入 |
| 编译错误诊断 | ⚠️ bsc 改进会削弱 | 中等，但不会消失（语义鸿沟结构性存在） |
| **BSV 陷阱库（traps）** | ❌ 越积累越深 | **深** |
| **设计决策表（decisions）** | ❌ 越积累越深 | **深** |
| **错误经验固化（captures）** | ❌ 越积累越深 | **深** |
| MCP 通道锁定 | ❌ 先发优势 + 生态惯性 | **深** |
| BSV 利基市场独占 | ❌ BSV 规模不会变大 | **极深（结构性）** |

**核心结论：specmate 的护城河可分为两类——**

1. **会消失的**：语法检查、基本错误诊断 → 不应该重度投入，7-18 议会已决议收缩
2. **越积累越厚的**：陷阱库、决策表、经验固化、MCP 通道锁定 → 应该全力投入

---

## 四、路径建议

### 4.1 收缩还是扩张？

**建议：聚焦 BSV，不做多语言扩展（至少 12 个月内）。**

理由：

| 考量维度 | 聚焦 BSV | 扩展到 Verilog/VHDL/Chisel |
|----------|---------|--------------------------|
| 知识深度要求 | specmate 的陷阱库在 BSV 上已有 65 条目沉淀 | 新语言的陷阱库需要从零开始，且需要对应语言的领域专家 |
| 竞品环境 | 无直接竞品，独占利基 | Verilog 有 NVIDIA ChipNeMo、开源 HDL Agent 等多个玩家 |
| 团队资源 | specmate 是单人项目 | 多语言 = 多倍的陷阱库维护成本 |
| 战略价值 | BSV 验证 DKE 模式 → 证明可行后复制 | 未经验证就扩张，风险极高 |

**正确的扩张路径不是"从 BSV 扩展到 Verilog"，而是"BSV 验证 DKE 模式 → Kova 框架标准化 → 复制到其他利基领域"。** 下一个 DKE 实例应该选择一个同样"太小而不值得竞争"的领域，而不是跳到 Verilog 这个红海。

### 4.2 "引领新时代开发模式"需要的关键里程碑

如果愿景是"引领 AI 驱动硬件开发的时代"，需要以下里程碑（按时间线）：

| 时间 | 里程碑 | 验证标准 |
|------|--------|---------|
| **2026 Q3** | BSV trap backlog 清零，达到 65+ 条全验证 | bench 对照实验：有 specmate 的 Agent vs 无 specmate 的 Agent，编译错误率降低 50%+ |
| **2026 Q3** | MCP Elicitation 集成，解决阶段感知 | 不再需要 Agent 模板里写"请告诉 specmate 你的设计阶段"——specmate 直接问 |
| **2026 Q4** | MCP Registry 注册，获得外部可见性 | BSV 开发者搜索"MCP server BSV"能找到 specmate |
| **2026 Q4** | 团队共享 captures，从单 Agent 工具变成团队基础设施 | 2+ Agent 共享一个知识库，错误经验不再独立 |
| **2027 H1** | bench 实验数据公开发表，证明"知识引擎 + Agent"模式的量化效果 | 被学术界或行业引用 |
| **2027 H1** | 第一个非 BSV 的 DKE 实例（Kova 框架概念验证） | 证明 DKE 模式不限于 BSV |
| **2027 H2** | Kova 框架开源 + DKE 开发者工具包 | 第三方可以为自己领域构建知识引擎 |

### 4.3 最大风险

| 风险类型 | 具体风险 | 可能性 | 影响 | 对策 |
|----------|---------|:------:|:----:|------|
| **技术风险** | 通用 LLM 对 BSV 的理解进步比预期快，削弱 specmate 的知识层价值 | 低（BSV 训练数据是噪声，结构性不会变） | 高 | 从"教 Agent BSV 语法"转向"沉淀团队设计经验"——后者 LLM 永远无法从公开数据学会 |
| **技术风险** | MCP 协议被新标准替代 | 低（OpenAI/Google 已站队，生态位已定） | 中 | 核心逻辑与协议层解耦，换协议只改适配层 |
| **市场风险** | BSV 用户增长停滞或萎缩，市场天花板锁死 | 低（学术界 + 特定工业持续使用） | 极高 | Kova 多领域扩展是终极对冲。但 **BSV 萎缩也是 specmate 独占利基的前提**——如果 BSV 变热门，大厂可能入场竞争 |
| **市场风险** | 有人做了一个"通用 HDL Agent"顺手覆盖了 BSV | 低（BSV 语义独特，通用方案覆盖不了） | 中 | speed to depth：在别人做广度的时候，specmate 做深度 |
| **依赖风险** | bsc 编译器停止维护或重大 Breaking Change | 极低 | 高 | specmate 不依赖 bsc，只对接 bsc 输出。bsc 换接口只影响 diagnose 的诊断模板 |
| **依赖风险** | Anthropic 的 MCP SDK 弃用 Node.js，或 MCP 规范破坏性升级 | 低 | 中 | specmate 使用的 MCP SDK 版本固定，不像 Web 服务有升级压力 |
| **执行风险** | 重静检、轻知识积累的方向选择错误 | 低（7-18 议会已共识） | 高 | 7-18 议会决议已锁定方向：静检收缩、知识积累为主 |

### 4.4 如果只做一件事，让 specmate 从"工具"变成"平台"

**答案：让 captures（错误经验固化）实现"项目级共享 + 自动闭环"。**

当前状态：
- captures 存本地 SQLite → 只有当前 Agent 能用到
- 需要 Agent 手动调 `specmate_capture` → Agent 经常忘记
- 每条 capture 都是孤立的 → 没有模式聚合

目标状态：
```
Agent 编译失败 → specmate_diagnose 诊断 → Agent 修复 → 编译通过
                                                      ↓
                                    specmate 自动检测"同样的错误 +
                                    同样的修复出现了 3 次" → 自动固化为 trap
                                                      ↓
                                    下次任何 Agent 遇到同样的错误 → 
                                    specmate_scan 直接预警（还没编译就知道）
```

这不是一个功能，而是一个闭环：**使用 specmate 的人越多，specmate 越聪明；specmate 越聪明，越多人使用。** 这就是平台效应。

可实现方案（Q4 时间线）：
1. `specmate_diagnose` 在 Agent 修复成功后，自动记录 `(error, fix)` pair 到 captures（不需要 Agent 手动调 `specmate_capture`）
2. captures 聚合分析：同一 error 出现 N 次 → 自动生成 trap 建议 → 人类验证后加入陷阱库
3. 团队共享 captures：换成 SQLite 远程或轻量服务端存储

**这一步做成，specmate 就从"静态知识库"变成了"活的、成长的、团队共享的知识系统"——这就是从工具到平台的跨越。**

---

## 五、总结

### 五个核心判断

| # | 判断 | 一句话 |
|---|------|--------|
| 1 | 行业格局 | specmate 独占 BSV 利基。通用 LLM 对 BSV 的理解永远停在"能写语法正确的代码"，不会达到"理解 rule 调度语义" |
| 2 | 模式对标 | 最接近的对标是 ESLint/Clippy + 医疗知识图谱 + 法律判例库。核心模式：LLM 做推理，结构化知识做地面真相 |
| 3 | 三层架构 | 中间层的不可替代性来自四个价值：BSV 训练数据噪声诅咒（不会消失）、编译器-AI 语义鸿沟（结构性的）、设计决策因果链（越积累越厚）、MCP 网关锁定（战略价值） |
| 4 | 护城河 | 会消失的（语法检查、基本诊断）→ 收缩。越积累越厚的（陷阱库、决策表、经验固化、MCP 锁定）→ 全力投入 |
| 5 | 路径 | 聚焦 BSV，12 月内不做多语言。关键里程碑：trap backlog 清零 → MCP Registry 发布 → 团队共享 captures → Kova 第二个 DKE 实例 |

### 一句话战略

**specmate 不从"AI 写代码助手"的角度竞争——它从"编译器永远不做的事"角度建立不可替代性。编译器的职责止于报错，specmate 的职责始于解释为什么以及怎么修。**

### 本次与 7-18 分析的更新

本轮在 7-18 分析基础上新增的维度：
- **模式对标**：ESLint/Clippy/医疗知识图谱/法律判例库的结构化对比
- **IDE 演进史**：LSP → MCP 的历史类比，说明 MCP 协议的架构意义
- **三层架构深度拆解**：中间层四大独特价值的逐一论证
- **"如果只做一件事"的聚焦建议**：captures 自动闭环 = 从工具到平台的跨越点
- **风险补充**：新增"BSV 萎缩反而是 specmate 优势"的反直觉判断

---

> 议会裁决：本轮分析确认 7-18 共识方向正确（收缩静检、聚焦知识积累），新增的三层架构分析强化了中间层的战略价值论证。下一步行动：Q3 trap backlog 清零 + MCP Elicitation 集成。
