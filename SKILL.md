# specmate — BSV 编码搭档

## 这是什么

specmate 是 BSV (Bluespec SystemVerilog) 硬件描述语言的 AI 编码搭档。它知道 BSV 编译器的坑、BSC 2025.07 的语法约束、以及高频错误的修复方案。把它当作坐在你旁边的 BSV 老工程师——每一步都应该先问它。

**specmate 和 bsc 的区别**：bsc 告诉你 WHAT（什么错了：错误码 + 行号），specmate 告诉你 **WHY**（为什么错：根因分析）和 **HOW**（怎么修：具体代码级别的 before/after 方案）。

## 快速开始

### 1. 编码前：任务扫描
```bash
npx specmate scan "你的任务描述" --file=bsv/Top.bsv
```
输出设计陷阱提醒、AST 预检结果（不等 bsc 编译就能发现 P0005/P0030/G0004 等高频错误）、设计决策建议。

### 2. 编码后：静态检查
```bash
npx specmate check bsv/*.bsv
```
检查位宽溢出、零位宽声明、Bool/Bit 误用、跨 rule 冲突模式。通过后再提交编译。

### 3. 编译失败：错误诊断
```
specmate_guide(phase="on_error", input="<粘贴 bsc 完整错误输出>")
```
获得现象描述、根因分析、具体修复方案（含 before/after 代码）、相关参考文档链接。修复后用 `specmate_resolve` 保存经验到知识库。

### 4. 查官方示例
```bash
npx specmate example <关键词>
```
在 4570 个 BSC 官方用例中搜索。例如 `npx specmate example i2c`、`npx specmate example mkFIFO`、`npx specmate example mkSyncFIFO --dir=bsc.scheduler`。

### 5. 快速参考查询
```
lookup_ref(topic="schedule")     # 调度注解、G0004 修复模式
lookup_ref(topic="types")        # Bool vs Bit#(1)、位宽规则
lookup_ref(topic="stdlib")       # FIFO/Reg/Vector 标准库速查
lookup_ref(topic="keywords")     # BSV/SV 保留字黑名单（P0005 高频）
lookup_ref(topic="module")       # 标准模块结构和 method 语法
```

## 核心原则

- **每一步都先问 specmate**。跳过 preflight 直接写代码，第一轮编译错误率 > 90%（07-i2c 实验：按要求走的 Agent 第 3 轮就通过，跳过的 Agent 连续 6 轮失败）。
- **specmate 是搭档，不是工具**。它提供知识，你写代码。不是"调完工具就完事"——关键是理解它的建议并体现在代码里。
- **不等编译，提前拦截**。specmate 的 AST 扫描（preflight）不需要跑 bsc 就能发现 P0005、P0030、G0004 等高频错误。跑一次 bsc 的时间够 preflight 扫 20 个文件。
- **每修复一个错误，知识库强一分**。用 `specmate_resolve` 保存你的修复经验，下次同类错误自动提醒。

## 常见场景

### 场景 1：开始写一个新模块
```bash
# 先扫任务，了解该领域的设计陷阱
npx specmate scan "实现一个 I2C 主控制器，支持 100kHz/400kHz" --file=bsv/I2cMaster.bsv
# 如果提示有设计选择（如 FIFO 选型），先做决定
# 然后开始编码并反复跑 check
npx specmate check bsv/I2cMaster.bsv
```

### 场景 2：完成文件准备提交
```bash
# 全量检查项目所有文件
npx specmate check bsv/*.bsv
# 编译（由 bench 平台统一执行，或手动）
# 如果编译有 warning，做 diff 对比
specmate_diff(bsc_output="<编译输出>", action="snapshot")
# 修复后再次编译，对比 warning 变化
specmate_diff(bsc_output="<编译输出>", action="diff")
```

### 场景 3：编译报错 P0005（function 保留字）
```bash
# 错误："P0005: V2K keyword 'function' used as identifier"
# Step 1: 先查修复方案
specmate_guide(phase="on_error", input="P0005: function is reserved word in module ...")
# specmate 会告诉你：function 是 Verilog-2001 保留字，
# genWith 回调不能用 function 关键字，用 \\== (1) 部分应用替代
# Step 2: 按方案修复代码
# Step 3: 保存经验
specmate_resolve(code="P0005", cause="genWith 回调使用了 function 关键字",
  solution="改用 \\\\== (1) 部分应用，如 genWith(requests, \\\\== (1))")
```

### 场景 4：编译报错 G0004（调度冲突）
```bash
# 错误涉及并行写入调度冲突
specmate_guide(phase="on_error", input="<bsc G0004 错误输出>")
# 同时查调度参考文档
lookup_ref(topic="schedule")
# 如果涉及复杂 rule 交互，用 analyze 做深度分析
specmate_analyze(files=["bsv/Top.bsv", "bsv/Sub.bsv"], question="调度冲突分析")
```

### 场景 5：不确定 FIFO 选型
```bash
# 在 scan 中描述选择困境
npx specmate scan "mkFIFO vs mkBypassFIFO vs mkPipelineFIFO 选择"
# 或通过 MCP
specmate_guide(phase="decide", input="fifo bypass pipeline 选型")
# 查看标准库参考
lookup_ref(topic="stdlib")
# 查官方示例看实际用法
npx specmate example mkBypassFIFO
```

### 场景 6：跨模块集成 / Top 层编写
```bash
# 先做拓扑级扫描
npx specmate scan "连接 SPI 主控制器、寄存器文件、UART 发送器" --file=bsv/Top.bsv
# 完成后做调度冲突分析
specmate_analyze(files=["bsv/Top.bsv"], question="所有 rule 的调度冲突分析")
```

### 场景 7：第一次用某个 BSV 语法特性
```bash
# 例：想用 StmtFSM 但不确定语法
npx specmate example StmtFSM
npx specmate example mkFSM --dir=bsc.scheduler
# 同时查范式模板
specmate_guide(phase="pattern", input="FSM state machine")
```

### 场景 8：编译通过了但编译 warning 在增长
```bash
# 建立 warning 基线
specmate_diff(bsc_output="<编译输出>", action="snapshot")
# 修改代码后对比
specmate_diff(bsc_output="<新编译输出>", action="diff")
# 输出会显示：哪些 warning 是新增的、哪些已消除、哪些持续存在
```

## 命令速查表

| 命令 | 用途 |
|------|------|
| `npx specmate scan "描述" [--file=xxx.bsv]` | 编码前全量扫描（陷阱+决策+预检+下一步建议） |
| `npx specmate check <文件...>` | 编码后静态检查（位宽/Bool/冲突模式） |
| `npx specmate example <关键词> [--dir=子目录]` | 搜索 BSC 官方示例 |

## 可选交互方式

specmate 支持两种通道接入：

- **CLI（推荐）**：`npx specmate` 命令。不需要启动服务，直接在终端使用。是主通道。
- **MCP（进阶）**：`specmate_*` 工具通过 MCP 协议调用。适合需要深度上下文分析的场景（analyze、diff、resolve）。

两种通道共享同一个知识库和错误记忆。
