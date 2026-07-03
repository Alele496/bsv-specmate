# 如何使用 BSV 参考用例库

> `examples/bsv/` 包含 BSC 官方测试套件的 4,570 个 `.bsv` 文件（5.58 MB）。
>
> 这些文件是从 `B-Lang-org/bsc` 仓库的 `testsuite/` 提取的，均为能正确编译/模拟的 BSV 代码。

## 目录分类

| 目录 | 内容 |
|------|------|
| `bsc.scheduler/` | rule 调度、urgency、冲突检测、互斥标注 |
| `bsc.typechecker/` | 类型检查（合法/非法类型用法） |
| `bsc.arrays/` | 数组声明与使用 |
| `bsc.compile/` | 基础编译测试 |
| `bsc.misc/` | 杂项测试 |
| `bsc.bugs/` | 已知 bug 复现用例 |
| `bsc.bsv_examples/` | 实际示例代码 |
| `bsc.long_tests/` | 复杂的长测试（默认禁用） |

## Agent 使用方式

Agent 通过 MCP Server 的 `lookup_example` 工具搜索，**不需要**直接读取这些文件。

### 搜索示例

```sh
# 关键词搜索（ripgrep）
rg -l "mkBypassFIFO" examples/bsv/
rg -l "conflict_free" examples/bsv/

# 搜索特定错误相关的用例
rg -l "descending_urgency" examples/bsv/bsc.scheduler/
```

## .bs 文件说明

`examples/bs/` 包含 882 个 `.bs` 文件（Bluespec Classic 语法）。

> ⚠️ **.bs 是旧语法，仅供参考。** 新代码必须使用 `.bsv` 语法。.bs 文件仍可用于参考：
> - 算法思路和模块结构
> - `.bsv` 中不存在但 `.bs` 中有的实现模式
> - **但不要直接复制语法，需要转换为 .bsv 语法**
