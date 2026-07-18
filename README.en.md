<div align="center">

# specmate 🤝

[![npm version](https://img.shields.io/npm/v/bsv-specmate?style=flat-square)](https://www.npmjs.com/package/bsv-specmate)
[![CI](https://github.com/Alele496/bsv-specmate/actions/workflows/knowledge-qa.yml/badge.svg)](https://github.com/Alele496/bsv-specmate/actions/workflows/knowledge-qa.yml)
[![License](https://img.shields.io/github/license/Alele496/bsv-specmate?style=flat-square)](https://github.com/Alele496/bsv-specmate/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)

> BSV finally has a mate — one that actually speaks BSV, remembers every time you faceplanted, and yells "heads up" before you even hit compile.

**[Install](#install) &bull; [Tools](#tools) &bull; [Workflow](#workflow) &bull; [Effectiveness](#effectiveness) &bull; [Status](#status) &bull; [Structure](#structure) &bull; [Docs](#docs)**

</div>

---

<a id="what-it-does"></a>

## 🌟 What It Does

AI writes Python like a champ. BSV? One compile and the screen is all red — not because AI is dumb, but because BSV is niche and training data is all ancient versions. specmate doesn't write code for your Agent. It points out the potholes before the Agent steps in them.

- **Trap prediction** — Building a FIFO pipeline? The last Agent faceplanted three times right here. Let me flag that. Powered by 30 domain knowledge graph nodes, minesweeping ahead of time.
- **Static checks** — 19 rules scanned across your `.bsv` files: method ordering, Bool operator misuse, SV reserved word collisions, literal overflow. No `bsc` needed. Results in seconds.
- **Error diagnosis** — Dump that wall of BSC red text in here. 29 encoded memories cross-referenced one by one. Root cause and the fix. New error it hasn't seen before? Auto-cataloged.
- **A grudge-holding code buddy** — Compile error → capture it → fix it → resolve to archive. SQLite-backed, every hit auto-increments. Same trap never twice — it really holds a grudge.
- **Code review** — tree-sitter genuinely parses BSV syntax trees, not regex hacks. Scheduling conflict matrices, cross-rule conflicts, dependency graphs — drawn out for you.

---

<a id="install"></a>

## 🚀 Quick Start

### Install

```bash
npm install -g bsv-specmate
```

Requires Node.js >= 18.

### MCP Configuration

Create `.mcp.json` at the root of your BSV project:

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

Launch your AI client (Claude Code / OpenCode / etc.) and the Agent will auto-discover specmate's tools.

> 🎚️ **Three intervention levels**:
>
> | Level | Behavior |
> |-------|----------|
> | `verify` social anxiety mode | Zero push. Silent observer. Only speaks up at final code review. |
> | `develop` daily mode (default) | Proactively pushes trap warnings before coding. Never misses a beat when it matters. |
> | `tapeout` chatterbox mode | Full guard. No corner left unchecked before delivery — every inspection item gets a pass. |

### Verify

Ask your Agent to write some BSV code. specmate will jump in automatically. If you get results back, you're all set. For detailed steps and troubleshooting, see the [Getting Started guide](docs/getting-started.md).

---

<a id="tools"></a>

## 🔧 MCP Tools at a Glance

specmate exposes 8 MCP tools for AI Agents to call.

| Tool | Purpose | When to call |
|------|---------|-------------|
| **`specmate_scan`** ⭐ | Unified entry: trap prediction + AST pre-scan + design advice | When you get a new task, before coding |
| **`specmate_check`** | 19-rule static scan of `.bsv` files | After writing a chunk of code, before compiling |
| **`specmate_diagnose`** | Feed in full BSC compile output, batch-diagnose all errors | The compile output is a wall of red |
| **`specmate_capture`** | Parse BSC compile errors, catalog new knowledge | When compilation fails |
| **`specmate_resolve`** | Solidify the fix, mark error as resolved | After the error is fixed |
| **`specmate_analyze`** | tree-sitter deep parse of BSV syntax tree | Investigating scheduling conflicts, dependency issues |
| **`specmate_diff`** | Diff compile snapshots, track warning changes | After refactoring, to compare compile changes |
| **`specmate_guide`** | Phased guidance (pre_code / on_error / continue / decide / pattern) | When you need step-by-step coaching |

`specmate_scan` is the recommended unified entry point, replacing the old multi-step call sequence. For full integration instructions (AGENTS.md templates, OpenCode config, role prompts), see the [Agent Integration Handbook](docs/agent-integration.md).

---

<a id="workflow"></a>

## 📋 Agent Workflow

```
Get a BSV task
  │
  ├─ specmate_scan({ task: "your task" })
  │   └→ Trap prediction + design advice + pattern recommendations
  │
  ├─ Write code
  │
  ├─ specmate_check({ files: ["/absolute/path/file.bsv"] })
  │   └→ 19-rule quick scan
  │
  ├─ bsc compile
  │   ├─ PASS → specmate_resolve to lock in the fix ✅
  │   └─ FAIL → specmate_diagnose + specmate_capture
  │       └→ Fix → back to compile → PASS → resolve ✅
```

> **Agent doesn't know specmate exists? You're not the first.** In our first experiment the Agent called specmate 0 times — not because the tools were bad, but because it didn't know it had a mate. Just tell it in conversation: "try running `specmate_scan` on your task." That's all it takes.

---

<a id="effectiveness"></a>

## 📊 Effectiveness at a Glance

Not hand-waving — we ran five controlled experiments. Same BSV project, same Agent. Only difference: specmate or bare.

Round one, the Agent didn't even know specmate existed — 0 calls the entire session. The problem wasn't the tool; the Agent just didn't know it had a mate. Round two, the Agent started calling it proactively — but at the wrong time, scanning after writing code, like reading the study guide after handing in the exam. Round three, we brought in Agents who knew neither codebase to do double-blind review — the specmate-assisted solution scored 16% higher on code quality blind review, and the reviewers had no idea which was which. Round four, we tightened the template constraints and first-compile pass rate jumped significantly. Round five focused on the review role — the biggest lever wasn't piling on more rules, but giving the Agent a reviewer role so it knew when to call which tool.

Core takeaway: specmate's value isn't writing code for the Agent. It's remembering all that niche BSV trivia the Agent learns and forgets every single time.

> Full data, experiment design, and methodology analysis in the **[SHOWDOWN report](docs/SHOWDOWN.md)**.

---

<a id="status"></a>

## 📈 Current Status

- Version 0.1.1, published on npm (`npm install -g bsv-specmate`)
- 8 MCP tools fully operational, CI-automated verification
- 12 BSV traps verified (fixture files + bsc compile double validation), 62 backlog items advancing daily
- 29 encoded memories covering common BSC compile errors
- 30 domain knowledge graph nodes, 19 static check rules
- pre-commit hook gate + GitHub Actions CI dual safety net

---

<a id="structure"></a>

## 📂 Project Structure

```
specmate/
├── bin/                  # MCP server entry (stdio / HTTP)
├── src/
│   ├── tools/            # 8 MCP tool implementations
│   ├── db/               # SQLite knowledge base persistence
│   └── config.mjs        # SPECMATE_LEVEL configuration
├── docs/
│   ├── errors/           # 29 encoded memories
│   └── traps/            # Verified trap documentation
├── test/fixtures/        # Each rule paired with pass.bsv + fail.bsv
└── examples/             # BSV sample code
```

Core philosophy: MCP tool layer receives Agent calls → knowledge graph does matching → SQLite persists experience. Not a lot of code — the weight is in the accumulated knowledge.

---

<a id="docs"></a>

## 📖 Documentation

- **First time?** Read the [Getting Started guide](docs/getting-started.md) — install, configure, three steps and done.
- **Integrating an Agent?** Read the [Agent Integration Handbook](docs/agent-integration.md) — AGENTS.md templates, OpenCode config, role prompts.
- **Curious about the design?** Read the [Architecture doc](docs/architecture.md) — design decisions, module relationships, data flow.
- **Want to see the numbers?** Read the [SHOWDOWN report](docs/SHOWDOWN.md) — all five controlled experiments, full design and analysis.
- **Diving into source?** Read the [Internal Overview](docs/internal-overview.md) — source structure, database schema, tool implementation details.

---

<a id="contributing"></a>

## 🤝 Contributing

specmate's knowledge comes from real-world battle scars. You hit a `bsc` error, the Agent runs `specmate_diagnose` → `specmate_capture` to log it → `specmate_resolve` to lock in the fix once it's solved → write up a doc explaining root cause and repair. Every piece of knowledge saves the next BSV dev from stepping in the same hole.

Issues and PRs welcome. Rule and trap fixture contributions are especially appreciated. What's a fixture? Every check rule gets two `.bsv` files — `pass.bsv` (the "should pass" case: code that's correct, rule should NOT fire) and `fail.bsv` (the "should fail" case: deliberately triggers the rule, rule SHOULD fire). When adding a new rule, run `node test/fixtures/run-fixtures.mjs` to verify all fixtures. Does not pass, does not merge — this is council iron law, no exceptions. See the directory layout and examples under `test/fixtures/check/` in existing rules.

---

## 🔗 Related Projects

- **[Kova](https://github.com/Alele496/kova)** — DKE domain knowledge engine framework; specmate is its first BSV instance
- **[bsc](https://github.com/B-Lang-org/bsc)** — The official Bluespec compiler; specmate's knowledge base depends on bsc compile output to accumulate experience
- **[bsc-contrib](https://github.com/B-Lang-org/bsc-contrib)** — Bluespec community libraries and tools, commonly used alongside BSV development

---

> MIT License | [Alele496](https://github.com/Alele496)
