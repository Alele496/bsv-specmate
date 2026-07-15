# specmate Agent 集成手册

> **目标读者：AI Agent（非人类开发者）**
> **版本：2026-07-14**
> **议会 S02E03 裁定：MCP 为 Agent 唯一正式通道。CLI 仅限人类调试。**

---

## 1. specmate 是什么

**specmate 是 BSV (Bluespec SystemVerilog) 编码知识引擎——它坐在你旁边，在你写代码之前告诉你哪里会踩坑，在你编译失败时告诉你为什么错、怎么修，在你修完后把经验固化到项目记忆里。**

区分一下：**bsc 编译器**告诉你 WHAT（错误码 + 行号），**specmate** 告诉你 WHY（根因）和 HOW（怎么修）。specmate 不是弱化版 bsc，它是 BSV 老工程师的经验层。

---

## 2. MCP 工具速查表

你作为 Agent，通过 MCP 协议调用以下 7 个工具。所有工具都需要**绝对路径**——相对路径会静默失败，不会报错，但你拿到的是空结果。

### 2.1 specmate_scan — 【推荐入口】统一预编码检查

- **何时用**：开始写代码之前。任何任务的第一步。
- **做什么**：一次性返回陷阱提醒、设计决策建议、AST 预编译扫描结果、下一步建议。
- **替代了**：旧的 `specmate_guide(pre_code)` + `decide` + preflight 三步调用。
- **参数**：
  - `task` (string, 必填)：任务描述。写清楚要做什么模块。例如 `"写一个 SPI 主控制器，支持模式 0 和模式 3"`。越具体，陷阱匹配越精准。
  - `file` (string, 可选)：已有 .bsv 文件的**绝对路径**。传入后 specmate 自动跑 AST 扫描，在响应中直接告诉你 P0030/P0005/T0043/G0053/G0005 等问题——不需要跑 bsc 就能发现。

```
调用示例：
specmate_scan({ task: "写 SPI 主控制器，CPHA=0, CPOL=0", file: "/d/Desktop/project/SpiMaster.bsv" })
```

### 2.2 specmate_check — 编译前静态检查

- **何时用**：写完代码后、跑 bsc 编译**之前**。必调。
- **做什么**：用规则 + 正则扫描 .bsv 文件，发现位宽溢出、零位宽字面量、Bool 误用、`always_ready`/`always_enabled` 滥用等问题。
- **参数**：
  - `files` (string[], 必填)：.bsv 文件的**绝对路径**列表。
  - `full` (boolean, 可选, 默认 false)：设为 `true` 运行全量检查（含正则类，误报率稍高）。编码完成后建议设 `full: true`。

```
调用示例：
specmate_check({ files: ["/d/Desktop/project/SpiMaster.bsv"], full: true })
```

### 2.3 specmate_guide — 细分阶段指导

- **何时用**：需要细粒度控制时。大部分场景用 `specmate_scan` 就够了。以下情况单独调 `specmate_guide`：
  - 编译失败了，需要诊断具体错误码 → `phase: "on_error"`
  - 两个方案拿不准，需要设计决策对比 → `phase: "decide"`
  - 需要一个标准模块骨架 → `phase: "pattern"`
- **参数**：
  - `phase` (enum, 必填)：`pre_code` | `on_error` | `continue` | `decide` | `pattern`
  - `input` (string, 必填)：对应阶段的输入——任务描述 / 错误码 / 两个选项 / 模块类型
  - `file` (string, 可选)：.bsv 文件绝对路径。`pre_code` 阶段传入后可获得 AST 扫描结果。

```
调用示例：
specmate_guide({ phase: "on_error", input: "G0004 bsc 输出中 rule 内多次写入寄存器" })
specmate_guide({ phase: "decide", input: "mkFIFO vs mkFIFO1 — 数据缓冲场景" })
specmate_guide({ phase: "pattern", input: "AXI4-Lite slave" })
```

### 2.4 specmate_capture — 记录编译错误

- **何时用**：bsc 编译失败后。把 bsc 的输出喂给 specmate，让它解析出错误码并入库。
- **做什么**：解析 bsc 的 stdout/stderr，提取 G/P/T/BSV 系列错误码，存入 SQLite 项目错误记忆。
- **参数**：
  - `bsc_output` (string, 必填)：bsc 编译器的完整 stdout + stderr。
  - `files` (string[], 可选)：关联的 .bsv 文件绝对路径。

```
调用示例：
specmate_capture({ bsc_output: "<bsc 编译失败的全部输出>" })
```

### 2.5 specmate_resolve — 固化修复经验

- **何时用**：修复编译错误**之后**。capture 是"记住了这个错"，resolve 是"记住了怎么修"。
- **做什么**：记录根因 + 修复方案，关联到最近的 capture。如果同一错误码出现过多次会触发记忆提醒。
- **参数**：
  - `code` (string, 必填)：错误码，如 `"G0004"`。
  - `cause` (string, 必填)：根因——为什么会出现这个错误。
  - `solution` (string, 必填)：修复方案——怎么改的，改了什么。

```
调用示例：
specmate_resolve({
  code: "G0004",
  cause: "rule do_work 内同时写了 clk_cnt 和 state_reg，bsc 判为同一 rule 内多次写入同一寄存器",
  solution: "拆成两个 rule：do_count 只写 clk_cnt，do_state 只写 state_reg"
})
```

### 2.6 specmate_analyze — AST 深度分析

- **何时用**：需要理解代码**结构**而非文本时。调度冲突、依赖关系、跨 rule 读写——这些不是 grep 能搞定的。
- **做什么**：用 tree-sitter 真解析 BSV 语法树，回答调度冲突矩阵、跨 rule 冲突、模块依赖图、调用图、寄存器读写分析等问题。
- **参数**：
  - `files` (string[], 必填)：.bsv 文件的**绝对路径**列表。
  - `question` (string, 必填)：想问什么。关键词触发不同分析路径：
    - 含"调度/冲突/schedule/G0004/G0010" → 调度冲突分析
    - 含"依赖/调用/call/dep" → 调用图和依赖图
    - 含"寄存器/reg/读写" → 寄存器分析
    - 含"方法/method" → 方法实现分析
    - 含具体行号 → 行级节点查询

```
调用示例：
specmate_analyze({ files: ["/d/Desktop/project/SpiMaster.bsv"], question: "所有 rule 的调度冲突分析" })
specmate_analyze({ files: ["/d/Desktop/project/SpiMaster.bsv"], question: "哪些寄存器在多个 rule 中被写入" })
```

### 2.7 specmate_diff — Warning 变化追踪

- **何时用**：编译-修复-重编译的迭代循环中。想知道这次编译比上次多了还是少了 warning。
- **做什么**：两种模式——`snapshot` 存储本次编译的 warning，`diff` 对比最近两次快照。
- **参数**：
  - `action` (enum, 必填)：`snapshot` | `diff`
  - `bsc_output` (string, snapshot 模式必填)：bsc 编译输出

```
调用示例：
// 第一次编译后
specmate_diff({ action: "snapshot", bsc_output: "<bsc 输出>" })
// 修复后第二次编译后
specmate_diff({ action: "diff" })
```

---

## 3. Agent 标准工作流

以下是每个 BSV 编码任务的标准流程。按顺序走，不要跳步。

### 阶段 1：编码前（理解任务 + 获取陷阱）

```
用户给了一个 BSV 编码任务
  │
  ├── 步骤 1: specmate_scan({ task: "<任务描述>" })
  │   如果已有 .bsv 文件骨架:
  │   specmate_scan({ task: "<任务描述>", file: "<.bsv 绝对路径>" })
  │
  │   拿到的是:
  │   - 与该任务相关的 BSV 陷阱（hard/quality 两级）
  │   - 如果关键词命中 DECISIONS 表 → 设计决策建议
  │   - 如果传了 file → AST 预编译扫描结果（不用跑 bsc 就能发现的问题）
  │   - 下一步建议
  │   ↓
  ├── 开始写代码。按 specmate_scan 返回的陷阱和约束来写。
  │   - Bit#(1) 不用 Bool
  │   - 显式 guard 不用 always_ready
  │   - 跨 rule 数据用 FIFOF 传递
  │   - ...等等
```

### 阶段 2：编码后（静态检查 + 编译）

```
写完 .bsv 文件
  │
  ├── 步骤 2: specmate_check({ files: ["<绝对路径>"], full: true })
  │   - 发现问题 → 修复 → 重新 specmate_check → 直到 0 问题
  │   ↓
  ├── 步骤 3: 跑 bsc 编译
  │   ├── 编译成功 → 跳到阶段 4
  │   └── 编译失败 → 进入阶段 3（错误处理）
```

### 阶段 3：编译失败（诊断 + 修复 + 记录）

```
bsc 编译失败，输出包含错误码
  │
  ├── 步骤 4: specmate_capture({ bsc_output: "<bsc 完整输出>" })
  │   记录错误码到项目记忆
  │   ↓
  ├── 步骤 5 (可选): specmate_guide({ phase: "on_error", input: "<错误码>" })
  │   或: specmate_analyze({ files: ["<路径>"], question: "为什么有这个调度冲突" })
  │   获取根因分析和修复建议
  │   ↓
  ├── 根据 specmate 的建议修复代码
  │   ↓
  ├── 步骤 6: 重新 specmate_check + bsc 编译
  │   ↓
  ├── 编译通过后:
  │   步骤 7: specmate_resolve({ code: "<错误码>", cause: "...", solution: "..." })
  │   固化修复经验
```

### 阶段 4：迭代优化（Warning 管理）

```
编译通过但有 warning
  │
  ├── 步骤 8: specmate_diff({ action: "snapshot", bsc_output: "<bsc 输出>" })
  │   ↓
  ├── 修复代码
  │   ↓
  ├── 重新编译
  │   ↓
  ├── 步骤 9: specmate_diff({ action: "diff" })
  │   对比：哪些 warning 消除了、哪些是新增的
```

### 快速决策：什么时候用什么工具

| 我现在的状态 | 调哪个工具 |
|-------------|-----------|
| 刚接到任务，还没写代码 | `specmate_scan` |
| 写完代码，准备编译 | `specmate_check` |
| 代码逻辑复杂，想理解 structure | `specmate_analyze` |
| 编译器爆红 | `specmate_capture` + `specmate_guide(on_error)` |
| 修好了，编译通过 | `specmate_resolve` |
| 想知道修完 warning 变多还是变少 | `specmate_diff(snapshot)` → 改 → `specmate_diff(diff)` |

---

## 4. 关键注意事项

### 4.1 绝对路径——铁律

**所有 MCP 工具的文件路径参数必须是绝对路径。** 相对路径不会报错——specmate 会静默返回空结果或错误分析。你拿到的可能是"未发现问题"——但其实是有问题的，只是 specmate 没找到文件。

```
❌ specmate_check({ files: ["SpiMaster.bsv"] })
   → "没有发现问题。"（其实根本没读到文件）

✅ specmate_check({ files: ["/d/Desktop/project/SpiMaster.bsv"] })
   → 正确扫描文件内容
```

Windows 路径注意：用正斜杠 `/d/Desktop/...` 而非 `D:\Desktop\...`。

### 4.2 不要用 CLI

`sCLImate scan` 和 `npx specmate check` 是人类开发者在终端手动调试用的。你是 Agent——通过 MCP 工具调用。CLI 和 MCP 走的是不同的代码路径：

- MCP `specmate_scan` → 直接调 `scan()` 函数 → 结构化返回
- CLI `npx specmate scan` → stdout 文本 → 你还要 parse

走 MCP，不要走 CLI。如果 specmate_scan 的输出里提到了 `npx specmate check`，把它翻译成 `specmate_check` MCP 调用——输出里那段文字是给人类看的，是已知 bug，会修复。

### 4.3 specmate_scan 是推荐入口

大部分时候，

```
specmate_scan({ task: "...", file: "..." })
```

等价于旧的：

```
specmate_guide({ phase: "pre_code", input: "..." })
+ decide()
+ preflight()
```

一步搞定。只有当你需要单独做"错误码诊断"或"两个方案对比"时，才用 `specmate_guide` 的 `on_error` 或 `decide` phase。

### 4.4 阶段感知

specmate 会根据你的任务描述自动推断你处于 `design`（架构）还是 `code`（编码）阶段，只推相关陷阱：

- 任务描述含"架构/设计/接口/选型/对比" → design 阶段 → 推 FIFO 选型、跨时钟域、调度策略等架构陷阱
- 其他（默认）→ code 阶段 → 推 Bool/Bit 区分、P0005 语法、method 顺序等编码陷阱

所以任务描述写得越具体，陷阱匹配越精准。

### 4.5 闭环：capture → resolve

这是 specmate 长期价值的核心——每解决一个编译错误就固化一次经验。不要跳过 capture 和 resolve：

```
bsc 报错 → specmate_capture → 修代码 → 编译通过 → specmate_resolve
```

下次你或你的队友遇到同一个错误码，specmate 会主动推送历史修复经验。

### 4.6 verified 过滤

specmate 当前只输出 `verified: true` 的陷阱条目（加上 `alwaysShow: true` 的 UNIVERSAL_TRAPS）。`verified: false` 的条目正在逐条验证中（backlog 65 条，每天验证 3 条），验证通过后自动出现在你的输出中。你今天看不到的陷阱，过几天可能就出现了——这是预期行为。

---

## 5. 故障排查

| 现象 | 可能原因 | 对策 |
|------|---------|------|
| specmate_scan 返回空，没有陷阱 | 任务描述太模糊，关键词没命中 | 写具体：模块类型 + 功能意图 |
| specmate_check 说没问题，但 bsc 挂了 | 用了相对路径，specmate 没读到文件 | 改用绝对路径 |
| specmate_analyze 返回"无法解析" | 文件路径不对，或 tree-sitter 解析失败 | 检查文件路径是否绝对、文件是否存在 |
| MCP 工具调用超时 | 安全分类器拦截（某些环境下 MCP HTTP 被拦） | 确认 SPECMATE_TRANSPORT=stdio |
