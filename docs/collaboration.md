# 协作开发模式

## specmate 3 工具速查

| 工具 | 何时调用 | 参数 |
|------|---------|------|
| **specmate_guide** | 编码前预测 / 编译报错 / 下一步 / 方案选择 | `phase`, `input` |
| **specmate_check** | 写完 .bsv 文件后 | `files: ["bsv/Foo.bsv"]` |
| **specmate_learn** | ~~遇到新错误码（guide 没收录）~~ **已废弃** — 用 specmate_capture + specmate_resolve 替代 | ~~`code`, `title`, `bsc_output`, `cause`, `solution`~~ |

### specmate_guide 的 4 个 phase

```
phase="pre_code"  → 输入任务描述 → 返回领域陷阱 + 编码记忆 + 参考
phase="on_error"  → 输入错误码/G0004 → 返回原因 + 方案 + 交叉引用
phase="continue"  → 输入下一步任务 → 返回预测陷阱 + 热点知识
phase="decide"    → 输入待选方案 → 返回方案对比 + 推荐
```

## Agent 典型工作流

```
开始任务    → specmate_guide(phase="pre_code", input="AXI4 Stream FIFO with BRAM")
写代码      → (specmate 幕后指导，不干扰对话)
写完检查    → specmate_check(files=["bsv/Module.bsv"])
修复问题    → specmate_guide(phase="decide", input="G0004 怎么拆 rule")
编译报错    → specmate_guide(phase="on_error", input="Error: G0010")
写下一部分  → specmate_guide(phase="continue", input="Flash 命令解析模块")
遇新错误    → ~~specmate_learn(code="G0124", title="...", ...)~~ 已废弃，用 specmate_capture + specmate_resolve 替代
```

Agent 永远只面对这 3 个工具，4 个 phase。specmate 内部处理所有细节（匹配知识图谱、查 SQLite、读参考文档），Agent 不需要知道内部有 8 个旧工具。

## 角色分工

| 角色 | 职责 | specmate 使用 |
|------|------|-------------|
| **Agent** | 项目分解、编码实现、编译调试 | 以上工作流，按 phase 调 guide，写完后调 check |
| **specmate** | 预编译质控层、BSV 领域知识引擎 | 静默在 Agent 身后，Agent 问才答。不自己改代码、不接 bsc |

## Agent 配置模板

```markdown
# {项目名称}

{项目描述、模块清单、接口约定}

代码写在 bsv/ 下。

specmate 是你的 BSV 编码助手，连接后自然就能使用：
- 开始写新模块前: specmate_guide(phase="pre_code", input="简短描述")
- 写完代码后: specmate_check(files=["bsv/Xxx.bsv"])
- 编译报错时: specmate_guide(phase="on_error", input="错误码或完整错误")
- 不确定方案时: specmate_guide(phase="decide", input="选项A vs 选项B")
- 继续写下一步: specmate_guide(phase="continue", input="下一步任务")
- 新错误码: ~~specmate_learn(code="...", ...)~~ 已废弃，用 specmate_capture 替代
```

同时放置 `.mcp.json` 加载 specmate MCP。

## Supervisor 工作流（协作开发）

Supervisor Agent 负责分阶段派发任务：

```
Phase 1: 基础模块 (BootROM, Timer, GPIO)
    │
    ├─ 发送任务描述 → Developer Agent
    ├─ 等待编译结果
    ├─ 有错：specmate_check 复核 → specmate_guide(phase="on_error") → 反馈 Developer
    └─ 通过 → 审查代码质量
        │
    Phase 2: 接口模块 (UART)
    Phase 3: 互连集成 (Wishbone Interconnect)
    Phase 4: DMA + Top 集成
```

Supervisor 使用 specmate 进行代码审查而非修改。

## 独立开发模式

单一 Agent 负责编写和审查，使用上述 Agent 配置模板。
Agent 第一次调 `specmate_guide(phase="pre_code", ...)` 时拿到陷阱预测，自然了解 specmate 的能力范围。

---

### 模板文件

| 文件 | 用途 |
|------|------|
| `{项目}/AGENTS.md` | Agent 极简模板（任务 + 接口约定 + specmate 使用说明） |
| `{项目}/.mcp.json` | MCP 配置加载 specmate |
| 参考：`bsv-test/project-periph/B/` | 实际例子 |
