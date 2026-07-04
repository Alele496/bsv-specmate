# specmate

[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-bsv--specmate-red?style=flat-square&logo=npm)](https://www.npmjs.com/package/bsv-specmate)
[![GitHub License](https://img.shields.io/github/license/Alele496/bsv-specmate?style=flat-square)](https://github.com/Alele496/bsv-specmate/blob/main/LICENSE)

> BSV Coding Knowledge Engine — Your Bluespec coding mate.

[🇨🇳 中文版](./README.md)

`specmate` is a **BSV Coding Knowledge Engine** — a domain knowledge layer for AI agents writing Bluespec SystemVerilog. It bundles a Coding Memory (12 entries, auto-counting), language reference docs (13 topics), design patterns (5 styles + 7 paradigms), and 4,570 official test suite examples. Helps agents write BSV code that compiles on the first try.

BSV is a niche hardware description language. AI training data lags behind the latest compiler — outdated syntax, missing keywords, and subtle scheduling rules make first-try compilation rare. This project accumulates real compilation errors into a Coding Memory, so agents can avoid common pitfalls before they compile.

> **Architecture**: specmate is the first domain instance of **Kova** (Knowledge Vault), a domain knowledge engine framework.
> Core architecture = DKE (Domain Knowledge Engine) + Coding Memory + Constraint Chain + Role Activation.
> See **[Kova Framework →](https://github.com/Alele496/kova)** and `docs/collaboration.md` for details.

## Why specmate

AI agents write Python and JS just fine — abundant training data. But niche
hardware languages like BSV are a different story: the model knows syntax
but not domain traps. `vec()` was deprecated in the 2025 compiler. `priority`
is an SV reserved word that triggers P0005. `Bool` values can't be spliced
into `Bit` expressions. Calling methods from multiple submodules in a single
rule triggers the dreaded G0004...

Every compilation error is a one-off fix — no memory persists. Switch to a
different agent, same mistakes all over again.

specmate changes this: compilation errors become a **Coding Memory** (SQLite-driven,
auto-counting, high-frequency first). Reference docs become on-demand searchable
**topics**. Code review becomes a **Supervisor role** that actively calls tools.
The agent stops being an "intern learning BSV from scratch every session."

The architecture turned out to be reusable — not just for BSV, but for any
niche language or domain. That's the **Kova framework**. specmate is its
first complete domain instance.

→ **[Kova Framework](https://github.com/Alele496/kova)**

### Why not bundle the bsc compiler?

specmate is a **pre-compilation quality layer** — its value is catching errors before compilation,
not after. `check_style` detects 18 categories of common syntax/type errors without calling bsc.

Bundling the compiler would require 200MB+ Docker images. For users with WSL/Linux, bsc is
already installed locally — agents can call it directly. Compiler integration is planned as an
optional plugin (Phase 3), not part of the core package.

| Feature | Description | MCP Tool |
|---------|-------------|----------|
| **🧠 Knowledge Guide** | 4 phases routing all queries: pre-code traps / error diagnosis / next-step / decision support | `specmate_guide` |
| **🔍 Static Check** | 18 regex rules: method order, Bool misuse, reserved words, literal overflow, struct fields, arg count, etc. | `specmate_check` |
| **✍️ Coding Memory** | 12 SQLite-driven errors, auto-increment on hit; agent calls specmate_learn for new errors | `specmate_learn` |
| **🎛️ 3-tier Levels** | `silicon` / `wafer` / `tapeout` control intimacy depth | `SPECMATE_LEVEL` |
| **📦 Zero Config** | `npm install -g` + one line of JSON | — |
| **💾 Persistent Data** | SQLite at `~/.specmate/`, configurable via `SPECMATE_DATA` | — |

- 🚀 [Quick Start](#-quick-start)
- 🛠 [Local Development](#-local-development)
- 📖 [Tutorial → docs/TUTORIAL.md](./docs/TUTORIAL.md)
- 🇨🇳 [中文 → README.md](./README.md)

---

## 🥊 SHOWDOWN: specmate vs. Bare-Metal AI

Three experiments, same requirements, one variable: specmate.

### Round 1: RISC-V Peripherals (OpenCode)

| | A (none) | B (specmate) |
|---|---|---|
| Fix rounds | 11 | **9 (-18%)** |

### Round 2: SD Card Controller (CCB × Collaboration)

| | A (6 rules) | B (Supervisor + specmate) |
|---|---|---|
| Coding time | 33m58s | **17m50s (-47%)** |
| Pass rate | 5/7 | **7/7** |

### Round 3: CRC-32 Processor (CCB × Blind Review)

First-ever **double-blind code review** — an anonymous agent scored both without knowing which was which:

| | A (6 rules) | B (specmate) |
|---|---|---|
| Coding time | 19m47s | **9m27s (-52%)** |
| Code quality (/25) | 19 | **22 (+16%)** |

The reviewer's verdict: *"code-2 is the more engineered solution — explicit FSM, defensive provisos, parameterized FIFO. 63% more code, but worth it."*

### 🎯 Conclusion

Two experiments, one clear answer:

**Collaboration (Supervisor + Developer) + proactive tool use**

Don't just list tools in AGENTS.md — Round 1 proved that doesn't work (0 calls).
Give the agent a **Supervisor review role**. When "code quality review" becomes
part of its job description, it naturally reaches for check_style, preflight, lookup_ref.

> Three lines of role description > six static coding rules > nothing at all.

---

## 📊 Usage Guide

| Scenario | Recommended Mode | Template | Effect |
|----------|-----------------|----------|--------|
| **New module / large project** | 🤝 **Collaboration** (Supervisor + Developer) | [docs/collaboration.md](docs/collaboration.md) | Highest pass rate, -47% coding time, +23% tokens |
| **Quick fix / small change** | 🔧 **Solo** (single agent) | [examples/templates/](examples/templates/) | Lightweight & fast, minimal AGENTS.md template |

**How to choose**:
- Starting a brand-new module → use the collaboration template, Supervisor will review
- Just fixing a known bug → use the solo template, enough & saves tokens
- Agent keeps forgetting specmate → gently nudge: "Try specmate_guide(phase=\"pre_code\", input=\"...\")"

→ **[📖 Complete Showdown Report](docs/SHOWDOWN.md)**

---

## ⚡ Quick Start

### Install

```bash
npm install -g bsv-specmate
```

### Configure CCB / Claude Code

Create `.mcp.json` in your project root:

```json
// npm version (Linux / WSL / Windows)
{
  "mcpServers": {
    "bsv-specmate": { "command": "npx", "args": ["bsv-specmate"] }
  }
}

// local dev
{
  "mcpServers": {
    "bsv-specmate": {
      "command": "node",
      "args": ["<absolute-path>/bin/server.mjs"],
      "env": { "SPECMATE_LEVEL": "tapeout" }
    }
  }
}
```

### Configure OpenCode

Create `opencode.json` in your project root:

```json
// npm version
{ "$schema": "https://opencode.ai/config.json",
  "mcp": { "bsv-specmate": { "type": "local", "command": ["npx", "bsv-specmate"], "enabled": true } } }

// local dev
{ "$schema": "https://opencode.ai/config.json",
  "mcp": { "bsv-specmate": { "type": "local", "command": ["node", "<absolute-path>/bin/server.mjs"], "enabled": true, "environment": { "SPECMATE_LEVEL": "wafer" } } } }
```

Restart your AI client. Agents will discover 3 MCP tools automatically.

---

## 🏗️ Project Templates

Quick-start a BSV project:

```bash
cp examples/templates/AGENTS.md ./AGENTS.md
cp examples/templates/opencode.json ./opencode.json
```

Edit `AGENTS.md` with your project description and module list. Update `<absolute-path>` in `opencode.json`.
Details at `examples/templates/README.md`.

---

## 🎛️ Capability Levels

| Level | Name | Mode | Best for |
|-------|------|------|----------|
| **`silicon`** | Silent | Shows toolbox once, then passive response | Quick fixes, known bugs |
| **`wafer`** (default) | Suggestive | Cross-references + scenario hints after each response | Daily development |
| **`tapeout`** | Collaborative | Pre-coding checklist, ongoing guidance, post-error cascade scan. Stays in the loop | New modules, complex projects, quality-critical code |

---

## 🛠 Local Development

### Requirements

- [Node.js](https://nodejs.org/) >= 18

```bash
git clone https://github.com/Alele496/bsv-specmate.git
cd bsv-specmate
npm install
node bin/server.mjs
```

### IDE dev config

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "specmate": {
      "type": "local",
      "command": ["node", "<absolute-path>/bin/server.mjs"],
      "enabled": true
    }
  }
}
```

---

## 📂 Project Structure

```
bsv-specmate/
├── AGENTS.md              ← Agent usage manual (3 tools + 4 phase workflow)
├── README.md              ← 中文版
├── README.en.md           ← English (you are here)
├── package.json
├── bin/
│   └── server.mjs         ← MCP Server entry point (3 tools)
├── src/
│   ├── config.mjs         ← Path resolution + LEVEL config
│   ├── db/
│   │   ├── schema.mjs     ← SQLite schema + queries
│   │   ├── seed.mjs       ← Markdown → SQLite
│   │   ├── export.mjs     ← SQLite → Markdown
│   │   └── query.mjs      ← DB query wrapper
│   └── tools/
│       ├── specmate_guide.mjs  ← Knowledge routing engine (4 phases)
│       ├── _matcher.mjs        ← Knowledge graph (22 domain nodes)
│       ├── specmate_learn.mjs   ← Coding memory entry
│       ├── check_style.mjs     ← Static checker (18 rules)
│       ├── lookup_error.mjs    ← Error lookup (internal)
│       ├── lookup_ref.mjs      ← Reference docs (internal)
│       ├── lookup_example.mjs  ← Example search (internal)
│       ├── coding_rules.mjs    ← Coding constraints (internal)
│       ├── preflight.mjs       ← Pre-coding preview (internal)
│       ├── suggest.mjs         ← Tool suggestions (internal)
│       └── add_error.mjs       ← Error contribution (internal)
├── scripts/
│   └── parse-testsuite.mjs ← BSC test suite error code extractor
├── data/
│   ├── knowledge.db        ← Seed DB (12 coding memories)
│   └── testsuite-errors.json ← Test suite error index (255 codes)
├── docs/
│   ├── BSV-STYLE.md       ← BSV coding conventions
│   ├── collaboration.md   ← Collaboration model
│   ├── TUTORIAL.md        ← Usage tutorial
│   ├── MAINTAINER.md      ← Maintenance guide
│   ├── errors/            ← Coding Memory docs (12 entries)
│   └── reference/         ← BSV language reference (13 topics)
└── examples/
    ├── bsv/               ← BSC official test suite (4,570 .bsv)
    └── bs/                ← Bluespec Classic legacy (reference only)
```

---

## 🔧 npm Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start MCP Server |
| `npm run db:seed` | Rebuild SQLite from `docs/errors/*.md` |
| `npm run db:export` | Export SQLite to Markdown at `~/.specmate/docs/errors/` |

---

## 💾 Data Storage

First run auto-creates `~/.specmate/`:

| Path | Content |
|------|---------|
| `data/knowledge.db` | SQLite knowledge base |
| `docs/errors/*.md` | Exported Markdown docs |

Custom path via environment variable:

```json
{
  "env": { "SPECMATE_DATA": "D:/my-bsv-data" }
}
```

---

## 🤝 Contributing

1. Encounter a new BSV compilation error → agent calls `specmate_learn` to store it
2. Run `npm run db:export` to export Markdown
3. Submit a PR to merge new errors back to main repo

---

## 💬 Tips: Getting Your Agent to Use specmate

specmate is a pre-compilation quality layer — the agent leads, specmate quietly provides domain expertise.

**In day-to-day use**, when the agent needs guidance, just reference the 5 phases:

```
Before coding: specmate_guide(phase="pre_code", input="brief task description")
After coding:  specmate_check(files=["bsv/File.bsv"])
On error:      specmate_guide(phase="on_error", input="error code")
Unsure:        specmate_guide(phase="decide", input="option A vs option B")
Next step:     specmate_guide(phase="continue", input="next task")
```

3 tools, 5 phases. No need to remember internal details. 🤏

---

## 📄 License

MIT
