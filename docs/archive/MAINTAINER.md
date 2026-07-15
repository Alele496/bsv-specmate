> ⚠️ **已过时**：最后更新于 2026-07-05。旧架构（8 工具、旧 level 名 silicon/wafer/tapeout、bsvtest 平台）已被替代。这是 specmate 最初的项目架构文档，对标当时的 README。当前维护信息见 `README.md` + `CLAUDE.md` + `docs/internal-overview.md`。

# 项目维护指南

> 新 Agent 接手 specmate / Kova / bsvtest 三个仓库时，先读这个文件。
> 读完你就能知道：仓库关系、文件作用、怎么改动、怎么发布、实验后更新什么。
>
> **第一次接手最快路径**: 第 12 节。

---

## 1. 仓库关系

```
Alele496/
├── bsv-specmate            ← npm 包, BSV 编码知识引擎 (主仓库)
│   └── 发布为: npm bsv-specmate
├── bsv-specmate-staging    ← 私有测试仓库 (同名, 实验性改动先推这里)
├── Kova                    ← 领域知识引擎框架 (概念文档 + 模板)
│   └── 不发布 npm, 纯架构参考
└── (bsv-test)               ← 实验平台 (本地, 不推送, 制品在 bsv-test/)
```

### 三库关系

| 仓库 | 公开 | 内容 | 用途 |
|------|------|------|------|
| **bsv-specmate** | ✅ 公开 | npm 包代码 + 文档 + 实验数据 | 生产发布, npm v0.1.0 |
| **bsv-specmate-staging** | ❌ 私有 | 同 bsv-specmate 的文件结构 | 实验性改动先推这里测试, 通过后推到公开仓库 |
| **Kova** | ✅ 公开 | 框架文档 + 模板 + 最小示例 | 概念层, 不对应 npm 包 |

### 发布流水线

```
开发 (本地)
    │
    ├── 实验性改动 → git push staging master
    │                    │
    │               CCB/OpenCode 测试
    │                    │
    │               ┌─ ❌ 继续修
    │               └─ ✅ → git push origin master → npm version X.Y.Z → npm publish
    │
    └── 小修复 → git push origin master (直接推公开)
```

### bsv-test 不推送

`D:\Desktop\bsv-test\` 在本地，包含实验项目、编译产物、CSV 数据。不推送到任何 remote——它只是你的实验工具。

---

## 2. 核心概念速查

按概念在代码中的顺序，每个概念一句话定位：

| 概念 | 解释 | 代码位置 |
|------|------|---------|
| **编码记忆** Coding Memory | SQLite 驱动, 每编译错误一条, 命中自动 +1 | `src/db/schema.mjs:errors`, `src/db/query.mjs` |
| **约束链** Constraint Chain | 深度 1 交叉引用图: check_style → lookup_ref | `bin/server.mjs:check_style handler` |
| **角色激活** Role Activation | Supervisor 角色描述 → Agent 主动调工具 | `docs/collaboration.md`, `templates/agents-experiment.md` |
| **LEVEL** 干涉强度 | 3 级: silicon (静默) / wafer (引导) / tapeout (全程协作) | `src/config.mjs:LEVEL_LIMITS`, `src/tools/coding_rules.mjs` |
| **热点知识** Knowledge Heat | `lookup_ref` 每次调用 +1, coding_rules 末尾显示热门 topic | `src/db/schema.mjs:ref_hits`, `src/tools/lookup_ref.mjs` |
| **Kova** Knowledge Vault | 领域知识引擎框架 (specmate 是其 BSV 实例) | `Alele496/Kova` 仓库 |
| **DKE** Domain Knowledge Engine | Kova 的架构理论 (3 层: 存储/质检/接口) | `kova/docs/DKE.md` |
| **SHOWDOWN** | 对照实验报告 (四战 + 盲审) | `docs/SHOWDOWN.md` |
| **bsvtest** | 实验自动化平台 (scaffold/compile/fix/record/chart) | `D:\Desktop\bsv-test\` |

---

## 3. 文件地图

### 3.1 核心代码 (`/src/` + `/bin/`)

| 文件 | 作用 | 修改频率 | 注意事项 |
|------|------|---------|---------|
| `bin/server.mjs` | MCP Server 入口, 注册 8 个工具, zod schema + cross-ref 逻辑 | 中 | 加新工具在这里; check_style 的 cross-ref 也是在这里 |
| `src/config.mjs` | 路径解析 (PKG_ROOT/DOCS/DATA), `getLevel()`, `LEVEL_LIMITS`, `initDataDir()` | 低 | 改 LEVEL 配置在这里 |
| `src/db/schema.mjs` | SQLite 建表 (errors + ref_hits), CRUD 函数 | 中 | 加新表在这里; getTopRules/getHotTopics 等查询函数 |
| `src/db/query.mjs` | 数据库查询封装 (ensureDB/saveDB), 异步层 | 低 | 所有 `queryXxx()` 封装在这里 |
| `src/db/seed.mjs` | `docs/errors/*.md` → SQLite 导入; 运行: `npm run db:seed` | 低 | 解析 Markdown 提取 code/title/cause/solution |
| `src/db/export.mjs` | SQLite → `docs/errors/*.md` 导出; 运行: `npm run db:export` | 低 | |
| `src/tools/coding_rules.mjs` | 返回 TOP N 编码约束 + 热点知识 + tapeout 风格建议 | 高 | 新增编码记忆后自动生效 (不用改); 改 intro/风格/热点 在这里 |
| `src/tools/check_style.mjs` | 8 条正则规则 (P0032/P0005/T0061/G0004/G0004_FSM/T0004/P0030/T0011 + Bool 拼接) | 高 | **加新规则在这里**; 函数签名必须带 `issues` 参数 |
| `src/tools/lookup_error.mjs` | 按错误码查编码记忆 + tapeout 级联扫描 | 低 | 新编码记忆添加到 `docs/errors/<CODE>.md` 后自动生效 |
| `src/tools/lookup_ref.mjs` | 读 `docs/reference/<topic>.md`; fire-and-forget 记录 hit | 低 | 改 topic 列表: `VALID_TOPICS` 数组; **zod schema 在 server.mjs 中也需同步** |
| `src/tools/lookup_example.mjs` | 遍历 `examples/bsv/*.bsv` 全文搜索; LEVEL 控制 maxFiles/maxLines | 低 | 改搜索目录: `BSV_DIR` |
| `src/tools/preflight.mjs` | 高频错误速览 + 设计警告 + tapeout 编码前检查清单 | 中 | 警告在 `COMMON_WARNINGS` 数组 |
| `src/tools/suggest.mjs` | 关键词匹配 → 工具建议; 10 个类别 | 中 | 加新关键词映射在这里 |
| `src/tools/add_error.mjs` | Agent 调用 → 写入 SQLite | 低 | |

### 3.2 文档 (`/docs/`)

| 文件 | 作用 | 修改频率 | 注意事项 |
|------|------|---------|---------|
| `docs/SHOWDOWN.md` | 四场对照实验报告 | 每次实验后 | **每次实验后追加新章节** |
| `docs/TUTORIAL.md` | 工具详解 + 工作流示例 + 自定义魔改指南 | 低 | 加新工具后更新这里 |
| `docs/BSV-STYLE.md` | BSV 编码规范总则 | 低 | 加新经验后更新 |
| `docs/checklist.md` | 编译前检查清单 (Agent 备用) | 低 | |
| `docs/collaboration.md` | Supervisor + Developer 协作模式文档 + 模板 | 低 | 改角色描述在这里 |
| `docs/MAINTAINER.md` | **你正在读的文件** | 每次重大改动后 | 维护指南自身也需要更新 |

### 3.3 编码记忆 (`/docs/errors/`)

| 文件 | 作用 | 修改频率 |
|------|------|---------|
| `INDEX.md` | 错误码索引表 (12 条, 含计数) | **每新增/修改错误后** |
| `<CODE>.md` | 单条错误的详细记录 (现象/原因/方案/规则) | **每新增错误后** |

### 3.4 参考文档 (`/docs/reference/`)

| 文件 | 内容 | topic 名 |
|------|------|---------|
| `module.md` | 模块/接口/rule/method 语法 | `module` |
| `types.md` | Bit/Bool/enum/struct/tuple | `types` |
| `syntax.md` | 常见语法模式与陷阱 | `syntax` |
| `stdlib.md` | Reg/FIFO/FIFOF/Vector/BRAM 标准库速查 | `stdlib` |
| `keywords.md` | BSV 关键字 + SV 保留字黑名单 | `keywords` |
| `schedule.md` | 调度注解 + Top 集成 + FSM G0004 模式 | `schedule` |
| `patterns.md` | 7 个设计范式 (CReg/管道/仲裁/BVI...) | `patterns` |
| `styles.md` | 5 种代码风格 (保守/精巧/工程/极简/实验) | `styles` |
| `tutorial.md` | BSV 中文教程章节索引 | `tutorial` |
| `examples.md` | 如何使用 examples/ 参考库 | `examples` |

### 3.5 其他文件

| 文件 | 作用 |
|------|------|
| `AGENTS.md` | Agent 使用手册 (独立/协作模式 + 编译命令 + 数据存储) |
| `README.md` / `README.en.md` | 项目主页 (起源故事 + SHOWDOWN + 快速开始 + Tips) |
| `package.json` | npm 包配置 (name: bsv-specmate, bin, dependencies) |
| `ISSUES.md` | GitHub Issues 清单 (9 个, 部分已过期) |
| `data/knowledge.db` | 预置种子 SQLite 数据库 |
| `.gitattributes` | CRLF 配置 |
| `.gitignore` | 排除 node_modules/ |

### 3.6 示例 (`/examples/`)

| 目录 | 内容 | 数量 |
|------|------|------|
| `bsv/` | BSC 官方测试套件 (来自 B-Lang-org/bsc testsuite/) | 4,570 .bsv |
| `bs/` | Bluespec Classic 旧语法 (仅供参考, 不推荐) | 882 .bs |
| `templates/` | 项目模板 (AGENTS.md ×2 + .mcp.json + README) | 4 文件 |

### 3.7 实验数据 (`/docs/experiments/`)

| 目录 | 内容 | 对应 SHOWDOWN 章节 |
|------|------|-------------------|
| `periph/` | RISC-V 外设: RECORD.md + PROMPTS.md | 第一战 |
| `sdcard/` | SD 卡控制器: RECORD.md + PROMPTS.md | 第二战 |
| `xclock/` | 跨时钟域 SoC: RECORD.md | 第四战 |

CRC-32 实验数据在 `D:\bsv-test\projects\packet-crc/` (未上传)。

---

## 4. 8 个 MCP 工具详解

### 4.1 `coding_rules()`

**输入**: 无 (自动读 SPECMATE_LEVEL)
**输出**: 3 级 intro (silicon/tapeout 不同) + TOP N 编码约束 + tapeout 风格建议 + 协作引导 + 热点知识
**依赖**: `src/tools/coding_rules.mjs`, `src/db/query.mjs:queryTopRules/queryHotTopics`
**修改指南**: 改 intro 在 `coding_rules.mjs` 的 `SILICON_INTRO`/`WAFER_INTRO`/`TAPEOUT_INTRO`
**何时触发**: Agent 调 `coding_rules()`

### 4.2 `preflight()`

**输入**: 无 (自动读 LEVEL)
**输出**: TOP N 高频错误 + 设计警告 (wafer/tapeout) + tapeout 编码前检查清单
**依赖**: `src/tools/preflight.mjs`, `src/db/query.mjs:queryAllErrors`
**修改指南**: 改警告在 `COMMON_WARNINGS` 数组; 改 tapeout 检查清单在 `collabHint` 块
**何时触发**: Agent 调 `preflight()`

### 4.3 `check_style(files)`

**输入**: `files: string[]` (.bsv 文件路径列表)
**输出**: 问题列表 (错误码 + 行号 + 建议) + 交叉引用 (wafer/tapeout) + tapeout 关闭语
**依赖**: `src/tools/check_style.mjs`
**修改指南**:
1. 在 `checkFile()` 中添加 `checkXxx(filename, lines, issues)` 调用
2. 实现 `checkXxx` 函数, 参数必须带 `issues`
3. 在 `bin/server.mjs` 的 cross-ref 块中添加对应提示
**8 条规则**: checkMethodOrder / checkBoolOperators / checkReservedWords / checkRuleDoubleWrite / checkVecUsage / checkBoolBitMismatch / checkValueMethodSyntax / checkMethodRegNaming / checkMultiSubmodule
**已知 bug**: 4 个函数曾缺 `issues` 参数 → 全部已修复 (commit 2c0c8e5)
**何时触发**: Agent 调 `check_style(files=["bsv/Foo.bsv"])`

### 4.4 `lookup_error(code)`

**输入**: `code: string` (如 "P0005", 无参数列出全部)
**输出**: 现象 + 原因 + 方案 + 规则 + crossRef topic 建议 + tapeout 级联扫描建议
**依赖**: `src/tools/lookup_error.mjs`, `src/db/query.mjs:queryError`
**修改指南**: 新错误 → 创建 `docs/errors/<CODE>.md` → `npm run db:seed`
**何时触发**: Agent 编译报错后调 `lookup_error("错误码")`

### 4.5 `lookup_ref(topic)`

**输入**: `topic: string` (10 个有效值)
**输出**: `docs/reference/<topic>.md` 全文
**依赖**: `src/tools/lookup_ref.mjs`
**修改指南**:
1. 新增 topic: 在 `docs/reference/` 下创建 `.md` → 加入 `VALID_TOPICS` 数组 → **同步 `bin/server.mjs` 的 zod enum**
2. **zod schema 双重维护**: `bin/server.mjs` line 85 使用 `z.enum(VALID_TOPICS)`, 如果改 `VALID_TOPICS` 别忘了重新导出
**侧效**: 每次调用自动 fire-and-forget 记录到 `ref_hits` 表
**何时触发**: Agent 调 `lookup_ref(topic="schedule")`

### 4.6 `lookup_example(keyword, [directory])`

**输入**: `keyword: string`, 可选 `directory: string`
**输出**: 匹配的 .bsv 代码片段 (最多 3-5 文件, 按 LEVEL 控制)
**依赖**: `src/tools/lookup_example.mjs`
**修改指南**: 改搜索目录在 `BSV_DIR`
**何时触发**: Agent 调 `lookup_example(keyword="FIFO")`

### 4.7 `suggest(context)`

**输入**: `context: string` (描述问题)
**输出**: 针对性工具调用建议 (10 个关键词类别)
**依赖**: `src/tools/suggest.mjs`
**修改指南**: 加新关键词 → 在 `suggest()` 中添加 `if (/xxx/i.test(context))` 块
**何时触发**: Agent 调 `suggest(context="G0004 不知道怎么修")`

### 4.8 `add_error(...)`

**输入**: `code, title, bsc_output, cause, solution, rules(可选)`
**输出**: 确认信息
**依赖**: `src/tools/add_error.mjs`
**修改指南**: 无需修改; Agent 调用自动入库
**何时触发**: Agent 遇到新编译错误时调 `add_error(code="P0032", ...)`

---

## 5. 编码记忆维护

### 5.1 新增一条错误

1. 在 `docs/errors/` 下创建 `<CODE>.md`, 参考已有格式:

```markdown
# X0000 — 错误标题 (×1)

**bsc 输出**：
```
bsc 原始错误输出
```

**原因**：根因分析

**解决**：修复方案 (含代码对比)

> **规则**: 通用规则提炼
```

2. 更新 `docs/errors/INDEX.md`: 加入新条目行 + 更新计数
3. 运行 `npm run db:seed` 重建 SQLite
4. 同步用户数据目录: `cp docs/errors/*.md ~/.specmate/docs/errors/`
5. 如果 check_style 能检测: 参考第 4.3 节添加检测规则

### 5.2 修改错误计数

1. 编辑 `<CODE>.md` 标题中的 `(×N)`
2. 编辑 `INDEX.md` 对应行的计数
3. `npm run db:seed` (SQLite 从 .md 重建计数)

### 5.3 db:seed vs db:export

| 命令 | 方向 | 用途 |
|------|------|------|
| `npm run db:seed` | Markdown → SQLite | 新增/修改编码记忆后, 重建数据库 |
| `npm run db:export` | SQLite → Markdown | 导出当前数据库状态供人工阅读 |

---

## 6. 参考文档维护

### 6.1 新增 topic

1. 在 `docs/reference/` 下创建新 `.md` 文件
2. 在 `src/tools/lookup_ref.mjs` 的 `VALID_TOPICS` 数组中添加新 topic 名
3. **关键**: 同步 `bin/server.mjs` 的 zod schema (line 85): `z.enum(VALID_TOPICS)` 已经引用了导出变量, 无需手动改——**前提是 VALID_TOPICS 是 `export const`**

### 6.2 修改现有 topic

直接编辑 `docs/reference/<topic>.md`, 无需其他步骤。`lookup_ref` 直接读取文件。

---

## 7. 每次实验后更新清单

每次对照实验完成后, 按此 checklist 更新所有相关文件:

```
[ ] 1. 编码记忆新增
    [ ] docs/errors/<新CODE>.md (每发现一个新错误)
    [ ] docs/errors/INDEX.md (新增条目 + 更新已有计数)

[ ] 2. 数据库同步
    [ ] cp docs/errors/*.md ~/.specmate/docs/errors/
    [ ] npm run db:seed

[ ] 3. check_style 规则 (如果新错误能用正则检测)
    [ ] src/tools/check_style.mjs (添加 checkXxx 函数)
    [ ] bin/server.mjs (cross-ref 块添加新 check code)

[ ] 4. SHOWDOWN
    [ ] docs/SHOWDOWN.md (追加新实验章节)
    [ ] 更新 "两战总览" 表为 "三战总览" / "N战总览"
    [ ] 更新时间声明

[ ] 5. 实验数据归档
    [ ] docs/experiments/<项目名>/ (复制 RECORD.md + PROMPTS.md)
    [ ] bsv-test/projects/<项目名>/ (本地实验文件)

[ ] 6. README 数据更新
    [ ] README.md: SHOWDOWN 节 + 编码记忆数量
    [ ] README.en.md: 同上英文版

[ ] 7. 图表
    [ ] cd D:\Desktop\bsv-test && bash bsvtest record <项目名> <轮次>
    [ ] bash bsvtest chart all

[ ] 8. 可选
    [ ] styles.md: 新增代码风格
    [ ] preflight.mjs: 更新 COMMON_WARNINGS
    [ ] suggest.mjs: 新增关键词映射
    [ ] TUTORIAL.md: 更新工具详解

[ ] 9. 提交
    [ ] git add -A && git commit -m "experiment <N>: <项目名>"
    [ ] git push staging master (先推私有)
    [ ] 测试通过后 git push origin master
```

---

## 8. 实验平台使用 (bsvtest)

位于 `D:\Desktop\bsv-test\`。所有命令在 WSL 终端内运行。

### 8.1 命令

```bash
cd /mnt/d/Desktop/bsv-test

# 创建新实验项目
bash bsvtest scaffold <项目名>

# 编辑任务描述
vim projects/<项目名>/task.md
# 然后手动填写 A/AGENTS.md 和 B/AGENTS.md

# 开两个 CCB (Windows), 分别进 A/ 和 B/
# 各发 goal: cat prompts/<项目名>-control.txt 和 prompts/<项目名>-experiment.txt

# 编译双方
bash bsvtest compile <项目名> [轮次]

# 生成修复提示词
bash bsvtest fix <项目名> A [轮次]    # 复制发给 Agent A
bash bsvtest fix <项目名> B [轮次]    # 复制发给 Agent B

# 记录本轮结果
bash bsvtest record <项目名> <轮次>

# 生成对比图表 (HTML)
bash bsvtest chart all
```

### 8.2 扩展 errors.map

`lib/errors.map` 每行一条映射: `错误码|描述|修复建议|specmate工具建议(可选)`。
新增错误码时追加一行即可, `fix-prompt.sh` 会自动使用。

### 8.3 文件结构

```
bsv-test/
├── bsvtest                     ← 主入口
├── README.md                   ← 平台使用说明
├── lib/                        ← 脚本 (scaffold/compile/fix/record/chart + errors.map)
├── templates/                  ← AGENTS.md 模板 (对照组/实验组) + .mcp.json
├── projects/                   ← 所有实验项目 (A/ + B/ + RECORD.md + task.md)
├── prompts/                    ← 自动生成的 goal 命令文件
├── logs/                       ← results.csv 累计数据
└── charts/                     ← specmate-showdown.html 图表
```

---

## 9. npm 发布流程

### 9.1 版本规则

```
v0.1.0 → v0.2.0: 功能新增 (新规则/新实验数据/新工具)
v0.2.0 → v0.2.1: Bug 修复
v0.2.1 → v0.3.0: 重大新功能 (如 compiler Phase 3)
v1.0.0: 生产可用, API 稳定
```

### 9.2 发布步骤

```bash
# 1. 确认所有改动在 staging 已测试通过
git push staging master

# 2. 更新版本号
npm version 0.2.0

# 3. 推送到公开仓库 + tag
git push origin master --tags

# 4. 发布到 npm
npm publish --access public

# 5. 验证
npm info bsv-specmate
```

### 9.3 发布前检查清单

```
[ ] README.md 数据已更新 (编码记忆数量, SHOWDOWN 数据)
[ ] SHOWDOWN.md 已追加最新实验章节
[ ] experiments/ 目录已归档
[ ] 编码记忆 db 已 seed
[ ] 无已知 bug (check_style issues 参数, zod enum 同步)
[ ] npm 包 namespace 正确 (bsv-specmate)
[ ] 双语文檔同步
```

---

## 10. 仓库同步 (staging ↔ 公开)

### 双 remote 配置

```bash
# 在 specmate 本地仓库
git remote -v
# origin    https://github.com/Alele496/bsv-specmate.git (公开)
# staging   https://github.com/Alele496/bsv-specmate-staging.git (私有)
```

### 同步过程

```bash
# 推送到私有 staging (测试版)
git push staging master

# 测试通过后, 推送到公开仓库
git push origin master
```

### staging 私有仓库的作用

1. **安全隔离**: 实验性改动不会污染公开仓库的提交历史
2. **测试环境**: 在 staging 上安装 `npm install github:Alele496/bsv-specmate-staging` 用于 CCB MCP 测试
3. **版本稳定性**: 公开仓库只有成熟改动, 用户 npm install 不会受到影响
4. **回滚方便**: staging 改坏了可以直接 force-push, 不影响公开版本

---

## 11. 当前状态 & 已知问题

### 11.1 当前规模

| 指标 | 值 |
|------|-----|
| 编码记忆 | 12 条 (P0005×6, G0010×3, G0004×2, T0061×3, ...) |
| check_style 规则 | 8 条 |
| 参考文档 topic | 10 个 |
| MCP 工具 | 8 个 |
| 代码风格 | 5 种 |
| 对照实验 | 4 场 |
| 盲审 | 2 次 |
| npm 版本 | v0.1.0 |

### 11.2 已修复的关键 bug

| Bug | 提交 | 影响 |
|-----|------|------|
| checkRuleDoubleWrite 缺 `issues` 参数 | `f618e61` | check_style 崩溃 |
| checkMethodOrder/checkBoolOperators/checkReservedWords 缺 `issues` 参数 | `2c0c8e5` | check_style 崩溃 (第二次) |
| lookup_ref zod schema 只 4 个 topic | `38c0b4b` | lookup_ref 参数验证拒绝 6 个新 topic |

### 11.3 已知限制

| 问题 | 现状 | 计划 |
|------|------|------|
| Agent 不会主动调 check_style | Supervisor 角色部分解决, 仍需"轻轻戳一下" | 研究 OpenCode/CCB 插件机制 |
| bsvtest compile 不适用于 import 链项目 | CRC-32 实验暴露; 需手动全量编译 | 修复 compile.sh |
| CCB MCP tool schema 缓存 | 重启 CCB 后刷新, 但用户可能忘记 | 文档提醒 |
| 无 bsc 编译器集成 | 设计决策 (预编译质控层) | Phase 3 可选插件 |

### 11.4 TODO 优先级

```
高:
[ ] npm v0.2.0 发布 (攒够改动)
[ ] 修复 compile.sh 全量编译支持

中:
[ ] 第五场实验: AXI Pipeline / Ultracode 多 Agent 编排
[ ] LEVEL 干涉强度完善 (第四战已验证 silicon 最优)

低:
[ ] Kova 新领域实例 (rust-craft)
[ ] CCB /ultracode 多 Agent 编排实验
```

---

## 12. 快速开始 (新 Agent 接手)

**第一次接手的 Agent, 按此顺序读:**

```
1. README.md                    ← 项目是什么, 怎么用 (5 min)
2. 本文件 (MAINTAINER.md)       ← 完整维护指南 (10 min)
    ↓ 然后根据需要跳到具体章节
3. bin/server.mjs               ← MCP 入口, 工具注册 (5 min)
4. docs/SHOWDOWN.md             ← 实验结论, 感受效果 (10 min)
5. src/tools/check_style.mjs    ← 大概率你要改的文件 (10 min)
```

**不要做的事**:
- ❌ 不要一次性读完所有 `docs/errors/*.md` — 需要时按错误码查
- ❌ 不要改 `src/db/schema.mjs` 的查询函数签名 — 多个工具依赖它们
- ❌ 不要改 `bin/server.mjs` 的 zod enum 而不更新 `lookup_ref.mjs` 的 `VALID_TOPICS` 导出
- ❌ 不要在新工具里用 if-else 链 — 用关键词映射 (参考 `suggest.mjs`)

**常见修改的操作路径**:

```
加一条编码记忆 → 见第 5.1 节
加一个 check_style 规则 → 见第 4.3 节
加一个参考文档 topic → 见第 6.1 节
实验后更新 → 见第 7 节 (checklist)
发布新版本 → 见第 9 节
推送到私有先测试 → 见第 10 节
```

---

> **最后更新**: 2026-07-05
> 本文件随项目演进持续更新。重大改动后请同步维护此文档。
