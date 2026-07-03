# specmate 详细教程

## 1. 能力等级 (SPECMATE_LEVEL)

通过环境变量控制所有 MCP 工具的返回信息量，适配不同开发场景：

| Level | 场景 | `preflight` | `check_style` | `lookup_error` | `lookup_example` |
|-------|------|-------------|---------------|----------------|------------------|
| **`silicon`** | 轻量速览 / 小修改 | TOP 3 错误 | 仅 error 级 | 仅规则总结 | 1 文件 / 15 行 |
| **`wafer`** (默认) | 日常开发 | TOP 5 + 3 警告 | error + warning | 完整详情 | 3 文件 / 30 行 |
| **`tapeout`** | 深度审查 / 新模块 | TOP 10 + 全部警告 + 编码建议 | error + warning + hint | 完整详情 | 5 文件 / 50 行 |

```json
{
  "mcpServers": {
    "specmate": {
      "command": "npx",
      "args": ["specmate"],
      "env": { "SPECMATE_LEVEL": "tapeout" }
    }
  }
}
```

---

## 2. MCP 工具详解

### preflight — 编码前速览

**调用时机**：每次编写 BSV 代码前调用，无需参数。

```
preflight()
```

**返回内容（随 level 变化）**：
- `silicon` — TOP 3 高频错误一句话摘要
- `wafer` — TOP 5 错误 + 3 条常见设计警告
- `tapeout` — TOP 10 错误 + 全部警告 + 深度编码建议

**内置警告清单**（后续可迁入 SQLite）：
1. 跨 Rule 数据传递（PulseWire+Reg 陷阱）
2. 跨模块调度标注（urgency 缺失）
3. Verilog 端口命名（方法名 ≠ 端口名）
4. Interface 导出歧义
5. always_ready 判断
6. Clock domain crossing

### check_style — 编译前静态检查

对 `.bsv` 文件做文本规则匹配，检测常见编译错误。

**调用示例**：

```
check_style(files=["bsv/Top.bsv", "bsv/Uart.bsv"])
```

**当前检测规则**：

| 规则 | 检测内容 | 对应错误 |
|------|---------|----------|
| P0032 | method 出现在 rule 之前 | 所有 method 必须在所有 rule 之后 |
| T0061 | Bool 类型前出现 `~` | Bool 用 `!`，不用 `~` |
| P0005 | 标识符使用 SV 保留字 | 改名为非保留字 |
| G0004 | 同一 rule 内同一寄存器 `<=` 多次 | 每个寄存器每条 rule 写一次 |

**添加新规则**：

编辑 `src/tools/check_style.mjs`，在 `checkFile()` 中添加一个新函数：

```javascript
function checkMyRule(filename, lines, issues) {
    for (let i = 0; i < lines.length; i++) {
        if (/你的正则/.test(lines[i])) {
            issues.push({
                file: filename,
                line: i + 1,
                check: 'CUSTOM',
                severity: 'warning',
                message: '你的提示信息',
                suggestion: '你的建议'
            });
        }
    }
}
```

然后在 `checkFile()` 中调用 `checkMyRule(filename, lines, issues)`。

**局限性**：

- 纯文本匹配，不做类型推断
- 位宽不匹配（T0060）等需要类型信息的错误无法检测
- 部分检测依赖启发式（如 Bool 变量名猜测），可能误报

---

### lookup_error — 错题本查询

**无参数调用**（列出所有已知错误）：

```
lookup_error()
```

返回按命中次数降序排列的错误列表。

**按错误码查询**：

```
lookup_error(code="P0005")
```

返回该错误的完整信息：现象（bsc 输出）、原因、解决方案、规则总结。

**自动计数**：每次查询命中，该错误次数自动 +1。

---

### lookup_ref — 规范文档查询

**可查询的 topic**：

| topic | 内容 |
|-------|------|
| `module` | 模块/接口/rule/method 语法 |
| `types` | 类型系统 (Bit, Bool, Int, enum, struct) |
| `syntax` | 常见语法模式与陷阱 |
| `examples` | 如何使用 examples/ 参考用例库 |

**调用示例**：

```
lookup_ref(topic="module")
```

**添加新 topic**：

在 `docs/reference/` 下创建新 `.md` 文件，然后在 `src/tools/lookup_ref.mjs` 的 `VALID_TOPICS` 数组中添加对应值。

---

### lookup_example — 官方用例搜索

在 `examples/bsv/` 中按关键词全文搜索。

**调用示例**：

```
lookup_example(keyword="BypassFIFO")
lookup_example(keyword="descending_urgency", directory="bsc.scheduler")
```

**参数说明**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `keyword` | ✅ | 搜索关键词，可多个词用空格分隔 |
| `directory` | ❌ | 限定搜索子目录（如 `bsc.scheduler`、`bsc.arrays`） |

**返回格式**：最多 5 个文件，每个文件显示关键词附近的代码片段。

**更新用例库**：

```bash
# 从 BSC 仓库拉取最新测试套件
git clone --depth 1 --filter=blob:none --sparse https://github.com/B-Lang-org/bsc.git /tmp/bsc
cd /tmp/bsc && git sparse-checkout set testsuite

# 只复制 .bsv 文件
find testsuite -name '*.bsv' -exec cp --parents {} /path/to/bsv-specmate/examples/bsv/ \;

# 重新构建种子数据库
cd /path/to/bsv-specmate && npm run db:seed
```

---

### add_error — 追加新错误

Agent 遇到 `lookup_error` 未命中的新错误时使用。

**字段说明**：

| 字段 | 必填 | 说明 |
|------|------|------|
| `code` | ✅ | 错误码，如 `"P0032"` |
| `title` | ✅ | 简要标题，如 `"Methods must be at end of block"` |
| `bsc_output` | ✅ | bsc 编译器的原始错误输出 |
| `cause` | ✅ | 根本原因分析 |
| `solution` | ✅ | 修复方案（可含代码示例） |
| `rules` | ❌ | 通用规则总结 |

**调用示例**：

```
add_error(
    code="G0004",
    title="Rule 内并行写入同一寄存器",
    bsc_output=`Error: "Foo.bsv", line 77: (G0004)
                Rule \`RL_spi' uses methods that conflict in parallel:
                  dac_busy_r.write(...)
                and
                  dac_busy_r.write(...)`,
    cause="同一 rule 内对 dac_busy_r 写入了两次。case 的 default 分支写入与 case 内分支相同的寄存器导致冲突。",
    solution=`删除 case 的 default 分支。枚举类型的所有值已由 action methods 限定，不需要 default 保护。

    // 修改前
    case (cmd_type)
        WRITE: begin busy_r <= False; end
        default: begin busy_r <= False; end  // ← 冲突
    endcase

    // 修改后
    case (cmd_type)
        WRITE: begin busy_r <= False; end
    endcase`,
    rules="同一 rule 内每个寄存器只能在一个无条件路径上被写入"
)
```

**重复追加**：如果错误码已存在，`add_error` 会更新内容（不新增，不改变计数）。

---

## 3. 工作流示例

### 独立开发模式

```
preflight() → 速览高频错误 + 警告

编写 .bsv 代码
    │
    ├─ 不确定语法 → lookup_ref / lookup_example
    │
    ▼
check_style(files=["bsv/Top.bsv"]) → 按提示修复
    │
    ▼
bsc 编译
    │
    ├─ 通过 → 完成
    └─ 报错 P0032 → lookup_error(code="P0032")
        ├─ 命中 → 按方案修复 → 重新编译
        └─ 未命中 → add_error(...) → 重新编译
```

### 协作开发模式

```
Writer Agent                       Reviewer Agent
─────────────                      ──────────────
编写代码                           
  │ 不确定时调 lookup_ref/examle   
  ▼                                
代码完成 ──────────────────→ check_style 预检
                                  │
                   ┌── 通过 → bsc 编译
                   │
                   └── 问题 → Writer 修复
                                  │
                                  ▼
                             bsc 编译
                                  │
                   ┌── 通过 → 完成
                   │
                   └── 报错 → lookup_error(错误码)
                                  │
                   ┌── 命中 → Writer 修复 → 重新编译
                   └── 未命中 → add_error 入库
```

---

## 4. 自定义与魔改

### 修改 check_style 检测规则

编辑 `src/tools/check_style.mjs`：

1. 在 `checkFile()` 中添加新的 `checkXxx()` 调用
2. 实现检测函数，传入 `(filename, lines, issues)` 三个参数
3. 每个检测到的问题 push 到 `issues` 数组

### 替换 examples/bsv/ 参考用例库

参考上文「更新用例库」步骤，从 BSC 仓库拉取最新测试套件。

### 修改 BSV 规范文档

编辑 `docs/reference/` 下的 `.md` 文件即可。`lookup_ref` 工具返回的是文件原文，不需要其他配置。

---

## 5. npm 脚本详解

### npm run db:seed

从 Markdown 文件重建 SQLite 知识库：

1. 读取 `~/.specmate/docs/errors/*.md`（用户数据目录）
2. 解析每条错误的标题、现象、原因、解决方案
3. 写入 `~/.specmate/data/knowledge.db`
4. 如果用户目录无文件，回退到 npm 包目录

### npm run db:export

从 SQLite 导出可读 Markdown 文档：

1. 读取 `~/.specmate/data/knowledge.db`
2. 按命中次数降序生成 `~/.specmate/docs/errors/<CODE>.md`

---

## 6. 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SPECMATE_DATA` | 用户数据根目录 | `~/.specmate/` |
| `SPECMATE_LEVEL` | 能力等级 `silicon` / `wafer` / `tapeout` | `wafer` |

### 初始种子数据流程

首次启动 `specmate` MCP Server 时：

1. 检测 `~/.specmate/` 是否存在
2. 若不存在 → 创建目录
3. 从 npm 包复制 `data/knowledge.db`（预置 8 条错误）
4. 从 npm 包复制 `docs/errors/*.md`
5. 后续所有读写都在 `~/.specmate/` 下进行
