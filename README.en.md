# specmate

[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-bsv--specmate-red?style=flat-square&logo=npm)](https://www.npmjs.com/package/bsv-specmate)
[![GitHub License](https://img.shields.io/github/license/Alele496/bsv-specmate?style=flat-square)](https://github.com/Alele496/bsv-specmate/blob/main/LICENSE)

> 🧠 Bluespec finally has a mate — a coding buddy that knows BSV, remembers your faceplants, and yells "watch your step" before you compile.

[🇨🇳 中文版](./README.md)

AI writes Python like a champ. BSV? Compile it and your screen turns red. It's not the AI's fault — BSV is niche, the training data is stale. `vec()` is deprecated but the model keeps using it. `priority` is an SV reserved word and it happily turns it into a variable name. A `Bool` somehow lands inside a `Bit` expression...

Worse: each compilation error is a one-off. Switch agents, same landmines, all over again.

**specmate fixes this.** It doesn't compile your code — it catches the potholes before you drive over them. 12 Coding Memory entries (SQLite, auto-increment on hit, high-frequency first), 13 language reference topics, 18 static check rules, 5 coding styles, 4,570 official test suite examples. It sits behind your AI agent via MCP and whispers "hey, remember G0010? The last agent tripped on this three times."

> specmate is the first domain instance of **Kova** (Knowledge Vault), a domain knowledge engine framework. Core architecture = DKE (Domain Knowledge Engine) + Coding Memory + Constraint Chain + Role Activation. See **[Kova →](https://github.com/Alele496/kova)** and `docs/collaboration.md`.

## 🤔 Why specmate

The BSV coding loop, as experienced by most: write code → compile → P0005 → fix → P0032 → fix → G0004 → fix → G0010... Round after round. You're not fixing logic bugs — you're fighting a language rules quiz you keep failing.

The problem isn't you or the AI. BSV's 2025.07 compiler differs significantly from older versions, and training data hasn't caught up. The agent knows syntax basics but not the new traps. And there's zero memory — the same G0004 can get a fresh agent three times.

specmate's job: turn each faceplant into a Coding Memory. Next time an agent writes similar code, specmate warns it before it even asks — "You're building a FIFO pipeline? Heads up: G0010. Previous agent crashed here three times."

### Why not bundle the bsc compiler?

specmate is a **pre-compilation quality layer**. It catches 18 categories of common syntax and type errors without ever calling bsc.

Bundling the compiler would mean 200MB+ Docker images. If you have WSL or Linux, bsc is already local — agents can call it directly. Compiler integration is a Phase 3 optional plugin, not part of core.

## 🛠 What it does

You write BSV → specmate checks what you're about to build, predicts the traps → you finish, it reviews → compilation barfs, it tells you why + how to fix → next time, it blocks the same pitfall before you step in. Like a grudge-holding code buddy.

| Feature | Description | Tool |
|---------|-------------|------|
| **🧠 Knowledge Guide** | 4 phases. Agent describes the situation, specmate routes internally — Coding Memory, reference docs, domain knowledge graph | `specmate_guide` |
| **🔍 Pre-compile Checkup** | 18 rules scanning .bsv: method order, Bool operator misuse, SV reserved word conflicts, literal overflow, argument count, struct field typos... No bsc, pure static analysis | `specmate_check` |
| **✍️ Learning from Pain** | New errors auto-stored. Same error code = hit count +1. High frequency rises to the top. Agent trips once, specmate remembers forever | `specmate_learn` |
| **🎛️ Three Intimacy Levels** | `silicon` (introvert) / `wafer` (the regular friend) / `tapeout` (the friend who won't stop checking in) | `SPECMATE_LEVEL` |
| **📦 Zero Config** | `npm install -g` + three lines of JSON. Agent discovers 3 MCP tools automatically | — |
| **💾 Persistence** | SQLite stores at `~/.specmate/`. Switch machines, switch agents — memory stays | — |

- 🚀 [Quick Start](#-quick-start)
- 🛠 [Local Development](#-local-development)
- 📖 [Tutorial → docs/TUTORIAL.md](./docs/TUTORIAL.md)
- 🇨🇳 [中文 → README.md](./README.md)

---

## 🥊 SHOWDOWN: specmate vs. bare-metal AI

Three experiments. Same BSV projects. One variable: specmate. The third round went further — we pulled in a neutral agent for double-blind code review.

specmate won every round. Faster. More stable. Better code.

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

First-ever **double-blind code review** — the reviewing agent had no idea which code came from which camp:

| | A (6 rules) | B (specmate) |
|---|---|---|
| Coding time | 19m47s | **9m27s (-52%)** |
| Blind review (/25) | 19 | **22 (+16%)** |

The reviewer's verdict: *"code-2 is the more engineered solution — explicit FSM, defensive provisos, parameterized FIFO. 63% more code, but worth it."*

### 🎯 The Takeaway

Three experiments, one insight: **it's not about writing more rules. It's about giving the agent a review role.**

Round 1, Agent B never touched specmate — not once. Not because the tools were bad, but because it didn't know it had a mate. Round 2, we gave the agent a Supervisor role: "Your job is to review code quality." Suddenly it clicked — 10+ proactive calls.

> Three lines of role description > six static rules > absolutely nothing.

---

## 📊 Usage Guide

| Scenario | Best Mode | Template | Effect |
|----------|-----------|----------|--------|
| **New module / large project** | 🤝 **Collaboration** (Supervisor + Developer) | [docs/collaboration.md](docs/collaboration.md) | Highest pass rate, -47% coding time |
| **Quick fix / small change** | 🔧 **Solo** (single agent) | [examples/templates/](examples/templates/) | Lightweight, minimal AGENTS.md |

**How to pick**:
- Building something new from scratch → collaboration template, Supervisor will review
- Fixing a known bug → solo template, saves tokens
- Agent keeps forgetting specmate → nudge it: "Try specmate_guide(phase=\"pre_code\", input=\"...\")"

→ **[📖 Full Showdown Report](docs/SHOWDOWN.md)**

---

## ⚡ Quick Start

### Install

```bash
npm install -g bsv-specmate
```

### Configure CCB / Claude Code

Drop a `.mcp.json` in your project root:

```json
// npm version
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

Drop an `opencode.json` in your project root:

```json
// npm version
{ "$schema": "https://opencode.ai/config.json",
  "mcp": { "bsv-specmate": { "type": "local", "command": ["npx", "bsv-specmate"], "enabled": true } } }

// local dev
{ "$schema": "https://opencode.ai/config.json",
  "mcp": { "bsv-specmate": { "type": "local", "command": ["node", "<absolute-path>/bin/server.mjs"], "enabled": true, "environment": { "SPECMATE_LEVEL": "wafer" } } } }
```

Restart your AI client. Agent auto-discovers 3 MCP tools.

---

## 🏗️ Project Templates

Quick-start a BSV project:

```bash
cp examples/templates/AGENTS.md ./AGENTS.md
cp examples/templates/opencode.json ./opencode.json
```

Edit `AGENTS.md` with your project description and module list. Details at `examples/templates/README.md`.

---

## 🎛️ Intimacy Levels

specmate has three personalities. Same tools, different levels of chattiness:

| Level | Vibes | Personality | Best for |
|-------|-------|------------|----------|
| **`silicon`** | Introvert 😶 | I answer what you ask. Not a word more. No suggestions, no cross-references. | Bug fixes, known issues, when you're in the zone |
| **`wafer`** (default) | The regular friend 💬 | I'll remind you, cross-reference, flag what matters. Just right. | **Default mode**, daily development |
| **`tapeout`** | The friend who won't quit 📢 | I'll warn you before you write, nudge while you code, and after an error I'll ask "Fixed? Want me to check if you're about to hit this again?" | New modules, complex projects, when quality counts |

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

Custom path:

```json
{
  "env": { "SPECMATE_DATA": "D:/my-bsv-data" }
}
```

---

## 🤝 Contributing

1. Agent hits a new compilation error → calls `specmate_learn` to store it
2. Run `npm run db:export` to export Markdown
3. Submit a PR to merge new errors back to the main repo

---

## 💬 Agent not using specmate? You're not alone

Round 1: Agent B called specmate **zero times**. Not because it didn't want to — it just didn't know it had a mate.

We gave it a Supervisor role: "Your job is to review code quality." Boom. 10+ proactive calls.

**So here's what you say:**

```
Before coding: specmate_guide(phase="pre_code", input="brief task description")
After coding:  specmate_check(files=["bsv/File.bsv"])
On error:      specmate_guide(phase="on_error", input="error code")
Unsure:        specmate_guide(phase="decide", input="option A vs option B")
Next step:     specmate_guide(phase="continue", input="next task")
```

3 tools, 5 phases. One sentence. Potentially one fewer compilation error. Works every time. 🤏

---

> 📄 MIT License
>
> 👤 Built by [Alele496](https://github.com/Alele496). May your compiles have fewer errors — and when they don't, specmate's got your back. 🤙
