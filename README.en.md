# specmate

[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-bsv--specmate-red?style=flat-square&logo=npm)](https://www.npmjs.com/package/bsv-specmate)
[![GitHub License](https://img.shields.io/github/license/Alele496/bsv-specmate?style=flat-square)](https://github.com/Alele496/bsv-specmate/blob/main/LICENSE)

> BSV Coding Knowledge Engine — Your Bluespec coding mate.

[🇨🇳 中文版](./README.md)

`specmate` is a **BSV Coding Knowledge Engine** — a domain knowledge layer for AI agents writing Bluespec SystemVerilog. It bundles a Coding Memory (11 entries, auto-counting), language reference docs (10 topics), design patterns (5 styles + 7 paradigms), and 4,570 official test suite examples. Helps agents write BSV code that compiles on the first try.

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
not after. `check_style` detects 8 categories of common syntax/type errors without calling bsc.

Bundling the compiler would require 200MB+ Docker images. For users with WSL/Linux, bsc is
already installed locally — agents can call it directly. Compiler integration is planned as an
optional plugin (Phase 3), not part of the core package.

| Feature | Description | MCP Tool |
|---------|-------------|----------|
| **📋 Coding constraints** | SQLite-driven rules sorted by hit count, auto-evolve as errors accumulate | `coding_rules` |
| **🚀 Pre-coding prep** | Scan high-frequency errors + design warnings before writing | `preflight` |
| **🔍 Static check** | Regex-based detection: rule/method order, Bool misuse, SV reserved words, `vec()` trap, duplicate register writes | `check_style` |
| **📚 Coding Memory** | 11 real compilation errors with phenomena, cause, and solution; auto-increment on hit | `lookup_error` |
| **📖 BSV reference** | Module syntax, type system, common patterns and pitfalls | `lookup_ref` |
| **🔎 Example search** | 4,570 `.bsv` files from BSC official test suite, keyword searchable | `lookup_example` |
| **✍️ Error contribution** | One tool call to add new errors — no Markdown editing needed | `add_error` |
| **🎛️ 3-tier levels** | `silicon` / `wafer` / `tapeout` control output detail for different dev scenarios | `SPECMATE_LEVEL` |
| **📦 Zero config** | `npm install -g` + one line of JSON config | — |
| **💾 Persistent data** | SQLite at `~/.specmate/`, configurable via `SPECMATE_DATA` | — |

- 🚀 [Quick Start](#-quick-start)
- 🛠 [Local Development](#-local-development)
- 📖 [Tutorial → docs/TUTORIAL.md](./docs/TUTORIAL.md)
- 🇨🇳 [中文 → README.md](./README.md)

---

## 🥊 SHOWDOWN: specmate vs. Bare-Metal AI

We ran two controlled experiments. Here's what we found.

### Round 1: RISC-V Peripherals (OpenCode)

| | Agent A (no specmate) | Agent B (specmate tapeout) |
|---|---|---|
| Fix rounds | **11** | **9 (-18%)** |
| Token | 171.3K | **149.7K (-13%)** |
| Design style | Hand-rolled ring buffer | Standard library FIFOF |

### Round 2: SD Card Controller (CCB × Collaboration)

Switched to CCB `/goal` auto-loop, first validation of **Supervisor collaboration mode**.

| | Agent A (6 static rules) | Agent B (Supervisor + specmate) |
|---|---|---|
| Coding time | 33m 58s | **17m 50s (-47%)** |
| Token | 15.7M | **12.1M (-23%)** |
| specmate calls | 0 | **10+** |
| Pass rate | 5/7 | **7/7 ✅** |

### 🎯 Conclusion: How to get the best out of specmate

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
- Agent keeps forgetting specmate → gently nudge in chat: "Try lookup_ref(topic=\"schedule\")?"

→ **[📖 Complete Showdown Report](docs/SHOWDOWN.md)**

---

## ⚡ Quick Start

### Install

```bash
npm install -g bsv-specmate
```

### Configure Claude Code

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "specmate": {
      "command": "npx",
      "args": ["bsv-specmate"]
    }
  }
}
```

### Configure OpenCode

In `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "specmate": {
      "type": "local",
      "command": ["node", "<absolute-path>/bin/server.mjs"],
      "enabled": true,
      "environment": {
        "SPECMATE_LEVEL": "wafer"
      }
    }
  }
}
```

Restart your AI client. Agents will discover 7 MCP tools automatically.

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
├── AGENTS.md              ← Agent usage manual (solo + collaborative modes)
├── README.md              ← English (you are here)
├── README.zh-CN.md        ← 中文版
├── package.json
├── bin/
│   └── server.mjs         ← MCP Server entry point (7 tools)
├── src/
│   ├── config.mjs         ← Path resolution + initialization
│   ├── db/
│   │   ├── schema.mjs     ← SQLite schema + queries
│   │   ├── seed.mjs       ← Markdown → SQLite
│   │   ├── export.mjs     ← SQLite → Markdown
│   │   └── query.mjs      ← DB query wrapper
│   └── tools/
│       ├── coding_rules.mjs    ← Dynamic constraints (SQLite-driven)
│       ├── preflight.mjs       ← Pre-coding error preview
│       ├── check_style.mjs     ← Static style checker
│       ├── lookup_error.mjs    ← Coding Memory lookup
│       ├── lookup_ref.mjs      ← BSV reference docs
│       ├── lookup_example.mjs  ← Official example search
│       └── add_error.mjs       ← Contribute new errors
├── data/
│   └── knowledge.db       ← Seed DB (11 coding memories)
├── docs/
│   ├── BSV-STYLE.md       ← BSV coding conventions
│   ├── checklist.md       ← Pre-compilation checklist
│   ├── TUTORIAL.md        ← Usage tutorial
│   ├── errors/            ← Coding Memory docs (11 entries)
│   └── reference/         ← BSV language reference (10 topics)
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

1. Encounter a new BSV compilation error → agent calls `add_error` to store it
2. Run `npm run db:export` to export Markdown
3. Submit a PR to merge new errors back to main repo

---

## 💬 Tips: Getting Your Agent to Use specmate

Two experiments taught us: the most effective approach is **giving the agent a review role** (Supervisor).
Tool calls jumped from 0 to 10+. See [SHOWDOWN](#-showdown-specmate-vs-bare-metal-ai).

**In day-to-day use**, if your agent writes code without touching specmate, a gentle nudge works:

```
If you're unsure about any BSV syntax, try lookup_ref(topic="xxx") 🧠
```

Same for specific situations:

- Agent stuck on G0004 → "Maybe try lookup_ref(topic=\"schedule\")?"
- Agent unsure about standard library → "Would lookup_ref(topic=\"stdlib\") help?"
- Agent wrote code without review → "Want to run check_style on this?"

One sentence. Potentially one fewer compilation error. 🤏

(PRs welcome if you've discovered better nudging techniques 😄)

One sentence. Potentially one fewer compilation error. 🤏

(PRs welcome if you've discovered better nudging techniques 😄)

---

## 📄 License

MIT
