# specmate

[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-bsv--specmate-red?style=flat-square&logo=npm)](https://www.npmjs.com/package/bsv-specmate)
[![GitHub License](https://img.shields.io/github/license/Alele496/bsv-specmate?style=flat-square)](https://github.com/Alele496/bsv-specmate/blob/main/LICENSE)

> 🧠 Bluespec finally has a mate — a coding buddy who knows BSV, remembers every faceplant, and yells "watch your step" before you compile.

[🇨🇳 中文版](./README.md)

AI writes Python like a champ. BSV? Hit compile and your screen turns red. It's not the AI's fault — BSV is niche, the training data is ancient: `vec()` is deprecated but the model keeps using it, `priority` is an SV reserved word it happily turns into a variable name, `Bool` somehow lands inside a `Bit` expression... The compiler crashes before you even know what went wrong.

And the worst part: every compilation error is a one-off. Switch agents, step on the same landmines, all over again.

**specmate fixes this.** It doesn't compile your code — it flags the potholes before you drive over them. 18 Coding Memory entries (SQLite-backed, auto-increment on hit, high-frequency first), 13 language reference topics, 18 static check rules, 5 coding styles, 4,570 official test suite examples. It sits behind your AI agent via MCP and whispers: "Hey — G0010. The last three agents tripped on this exact thing."

> specmate is the first domain mate of **Kova** (Knowledge Vault), a domain knowledge engine framework. Core architecture = DKE (Domain Knowledge Engine) + Coding Memory + Constraint Chain + Role Activation. See **[Kova →](https://github.com/Alele496/kova)** and `docs/collaboration.md`.

## 🤔 Why specmate

The BSV coding loop goes like this: write code → compile → P0005 → fix → P0032 → fix → G0004 → fix → G0010... Round after round. You're not fixing logic bugs — you're fighting a language-rules quiz you keep failing.

It's not you, and it's not the AI. BSV's 2025.07 compiler differs meaningfully from older versions, and the training data hasn't caught up. Agents know the syntax basics but not the new traps. Worse — there's zero memory. The same G0004 can nail a fresh agent three times.

specmate's job: turn each faceplant into a Coding Memory. Next time an agent writes similar code, specmate warns it before it even asks — "You're building a FIFO pipeline? Watch out for G0010. Last agent crashed here three times."

### Why not bundle the bsc compiler?

Because specmate doesn't catch you after you fall — it tells you to watch your step before you walk. It's a **pre-compilation quality layer** that detects 18 categories of common syntax and type errors without ever calling bsc.

Bundling the compiler means 200MB+ Docker images. If you have WSL or Linux, bsc is already local — agents can call it from the shell directly. Compiler integration is a Phase 3 optional plugin, not part of core.

## 🛠 What it does

You write BSV → specmate looks at what you're about to build, predicts where you'll trip → you finish, it reviews → compilation barfs, it tells you why + how to fix it → next time, it blocks the same pitfall ahead of time. Like a code buddy with a long memory and a grudge.

| Feature | Description | Tool |
|---------|-------------|------|
| **🧠 Knowledge Guide** | 4 phases. Agent describes the situation, specmate routes internally — Coding Memory, reference docs, domain knowledge graph | `specmate_guide` |
| **🔍 Pre-compile Checkup** | 18 rules scanning .bsv: method order, Bool operator misuse, SV reserved word conflicts, literal overflow, argument count mismatch, struct field typos... No bsc, pure static | `specmate_check` |
| **✍️ Learning from Pain** | New errors auto-stored. Same error code = hit count +1. High frequency rises to the top. Agent trips once, specmate remembers forever | `specmate_learn` |
| **🎛️ Three Development Modes** | `verify` (zero-push, rapid iteration) / `develop` (pre-code trap warnings) / `tapeout` (full guard at delivery). Same tools, different intervention — based on where your code is headed | `SPECMATE_LEVEL` |
| **📦 Zero Config** | `npm install -g` + three lines of JSON. Agent auto-discovers MCP tools | — |
| **💾 Persistence** | SQLite stores at `~/.specmate/`. Switch machines, switch agents — memory stays | — |

- 🚀 [Quick Start](#-quick-start)
- 🛠 [Local Development](#-local-development)
- 📖 [Tutorial → docs/TUTORIAL.md](./docs/TUTORIAL.md)
- 🇨🇳 [中文 → README.md](./README.md)

---

## 🥊 SHOWDOWN: specmate vs. bare Agent

We ran eight rounds — same BSV project, one variable: with or without specmate. Rounds 3 and 4 introduced double-blind review with independent agents who didn't know which code came from which camp. Round 5 brought in an automated experiment framework (specmate_bench). Rounds 6–8 validated new findings about design correctness vs. task difficulty.

The result? specmate is faster, more stable, produces better code. But speed isn't everything.

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
| Code quality (blind /25) | 19 | **22 (+16%)** |

The reviewer's verdict: *"code-2 is the more engineered solution — explicit FSM, defensive provisos, parameterized FIFO. 63% more code, but worth it."*

### Round 4: Cross-Clock-Domain SoC (CCB × Three Modes × Independent Blind Review)

First use of an **independent AI exam committee** to design the task, and the first **verify / develop / tapeout three-mode comparison**:

| | A (none) | B1 (verify) | B2 (develop) | B3 (tapeout) |
|---|---|---|---|---|
| Blind review (/100) | 85.5 | **96.5** 🥇 | 88.0 | 88.0 |

**The quiet one won.** B1 (verify — fewest words) scored 8.5 points higher than B3 (tapeout — most words). Fewer words = sharper focus on core design. Too many "you might also want to consider..." tangents pulled attention away from what actually mattered.

### Round 5: UART Transmitter (CCB × specmate_bench Automation)

First use of **specmate_bench** — an automated experiment framework that replaced manual copy-paste workflows with structured, reproducible pipelines.

| | A (6 rules) | B (specmate + Supervisor) |
|---|---|---|
| Compilation | R1 ❌ T0043 → R2 ✅ | R1 ✅ (5w) → R2 ✅ 0w |
| Code quality (blind /25) | 16 | **22 (+37.5%)** |
| Architecture | 2-rule minimalist | 5-rule explicit FSM |
| Key issue | busy false-idle, missing synthesize | guard mutual exclusion eliminated all warnings |

**New discoveries**: T0043 (Integer parameters not synthesizable) added to memory; tree-sitter-bsv misidentified `<=` comparison as assignment.

### 🎯 Five rounds in, then three more

After five rounds, one thing became crystal clear: the most effective thing isn't writing more rules — it's **giving the agent a reviewer role**.

In Round 1, Agent B called specmate zero times — not because the tools were bad, but because it literally didn't know it had a mate. Round 2 gave the agent a Supervisor role: "Your job is to review code quality." Suddenly it clicked — 10+ proactive calls. Round 4 went further — fewer words scored higher. Round 5 brought automation, turning manual experiments into reproducible pipelines.

Three follow-up rounds (SPI, AXI-Stream, CRC-8) validated two new insights:

**Fast is not good.** In the SPI Master experiment, Agent B (specmate) compiled in 3 rounds while Agent A needed 6 — yet Agent A won the blind review. specmate fixes compilation errors, but it doesn't design your module for you. LSB-first violated SPI convention. Missing FIFO lost data. specmate didn't catch either — those are design decisions, not syntax traps.

**Task difficulty determines specmate's value.** The AXI-Stream adapter passed on the first try for both sides — standardized interface protocols don't need domain knowledge. CRC-8's Ultracode fully-automated scaffold → code (A+B parallel) pipeline ran successfully for the first time.

> Three lines of role description > six static rules > absolutely nothing.

---

## 📊 Usage Guide

| Scenario | Best Mode | Template | Effect |
|----------|-----------|----------|--------|
| **New module / large project** | 🤝 **Collaboration** (Supervisor + Developer) | [docs/collaboration.md](docs/collaboration.md) | Highest pass rate, -47% coding time |
| **Quick fix / small change** | 🔧 **Solo** (single agent) | [examples/templates/](examples/templates/) | Lightweight, minimal AGENTS.md |

**How to pick**:
- Building a new module from scratch → collaboration template, Supervisor will review your work
- Fixing a known bug → solo template, saves tokens
- Agent keeps forgetting to call specmate → nudge it in chat: `specmate_guide(phase="pre_code", input="...")`

→ **[📖 Full Showdown Report](docs/SHOWDOWN.md)**

---

## ⚡ Quick Start

### Install

```bash
npm install -g bsv-specmate
```

### Start the Server

**stdio mode** (CCB auto-launches, no manual steps):
```json
// .mcp.json
{ "mcpServers": { "bsv-specmate": { "command": "npx", "args": ["bsv-specmate"] } } }
```
CCB spawns the child process on start and tears it down on close. Ideal for solo development.

**Streamable HTTP mode** (manual start, supports server push):
```bash
# Terminal 1: start the server
node bin/server.mjs
# → [specmate] MCP Streamable HTTP on http://127.0.0.1:9339/mcp

# Or run in background
node bin/server.mjs &
```
```json
// .mcp.json
{ "mcpServers": { "bsv-specmate": { "url": "http://127.0.0.1:9339/mcp" } } }
```
The server runs independently — CCB connects via HTTP. This enables specmate to push notifications proactively. The `/health` endpoint is available for status checks.

> **Both transports can coexist.** stdio is most convenient for CCB today (auto start/stop). Streamable HTTP is the choice when you need push capabilities. Auto start/stop for Streamable HTTP via CCB hooks is under consideration.

### Configure CCB / Claude Code

Drop a `.mcp.json` in your project root:

```json
// npm version (stdio)
{
  "mcpServers": {
    "bsv-specmate": { "command": "npx", "args": ["bsv-specmate"] }
  }
}

// local dev (stdio)
{
  "mcpServers": {
    "bsv-specmate": {
      "command": "node",
      "args": ["<absolute-path>/bin/server.mjs"],
      "env": { "SPECMATE_LEVEL": "develop" }
    }
  }
}

// Streamable HTTP (recommended — supports specmate push)
// First start the server: node bin/server.mjs
// Then configure CCB:
{
  "mcpServers": {
    "bsv-specmate": {
      "url": "http://127.0.0.1:9339/mcp"
    }
  }
}
```

> **Default mode**: `develop` — pushes trap warnings before coding. Switch to `verify` for zero-push rapid iteration, or `tapeout` for full guard at delivery time.

### Configure OpenCode

Drop an `opencode.json` in your project root:

```json
// npm version
{ "$schema": "https://opencode.ai/config.json",
  "mcp": { "bsv-specmate": { "type": "local", "command": ["npx", "bsv-specmate"], "enabled": true } } }

// local dev
{ "$schema": "https://opencode.ai/config.json",
  "mcp": { "bsv-specmate": { "type": "local", "command": ["node", "<absolute-path>/bin/server.mjs"], "enabled": true, "environment": { "SPECMATE_LEVEL": "develop" } } } }
```

Restart your AI client. Agent auto-discovers MCP tools.

---

## 🏗️ Project Templates

Quick-start a BSV project:

```bash
cp examples/templates/AGENTS.md ./AGENTS.md
cp examples/templates/opencode.json ./opencode.json
```

Edit `AGENTS.md` with your project description and module list. Details at `examples/templates/README.md`.

---

## 🎛️ Three Development Modes

specmate doesn't grade by agent experience — it grades by **where your code is going**. The same agent gets `verify` for a bug fix, `develop` for a new module, `tapeout` before delivery.

Round 4 tested all three modes with an independent exam committee plus double-blind review:

| Level | Scenario | Push Strategy | Blind Review (/100) |
|-------|----------|---------------|:-------------------:|
| **`verify`** 🔬 | Rapid iteration, get logic working | Zero push — answers only when asked | — |
| **`develop`** (default) 🛠 | New modules, architecture | Pre-code trap warnings | — |
| **`tapeout`** 🏭 | Delivery time, FPGA/ASIC | Full guard + review | **96.5** vs 85.5 (no specmate) |

**Design principle**: It's not about saying more — it's about saying the right thing at the right time.

```
verify:   Don't get in my way, I know what I'm doing
develop:  Warn me about traps before I step in
tapeout:  Leave nothing unchecked — full guard
```

> Legacy names `silicon`/`wafer` are still accepted and auto-map to `verify`/`develop`.

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
├── AGENTS.md              ← Agent usage manual (tools + 4-phase workflow)
├── README.md              ← 中文版
├── README.en.md           ← English (you are here)
├── package.json
├── bin/
│   └── server.mjs         ← MCP Server entry point, registers all tools
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
│   ├── knowledge.db        ← Seed DB (18 coding memories)
│   └── testsuite-errors.json ← Test suite error index (255 codes)
├── docs/
│   ├── BSV-STYLE.md       ← BSV coding conventions
│   ├── collaboration.md   ← Collaboration model
│   ├── TUTORIAL.md        ← Usage tutorial
│   ├── MAINTAINER.md      ← Maintenance guide
│   ├── errors/            ← Coding Memory docs (18 entries)
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

1. Agent hits a new compilation error → call `specmate_learn` to store it
2. Run `npm run db:export` to export Markdown
3. Submit a PR to merge new errors back to the main repo

---

## 💬 Agent not using specmate? You're not alone

Round 1: Agent B called specmate **zero times**. Not because the tools didn't work — it genuinely didn't know it had a mate.

We gave it a Supervisor role: "Your job is to review code quality." Boom. 10+ proactive calls.

**So here's all you need to say:**

```
Before coding:    specmate_guide(phase="pre_code", input="brief task description")
After coding:     specmate_check(files=["bsv/File.bsv"])
Compilation error: specmate_guide(phase="on_error", input="error code")
Unsure which path: specmate_guide(phase="decide", input="option A vs option B")
Next step:        specmate_guide(phase="continue", input="next task")
```

A handful of tools, the right timing. One sentence. Potentially one fewer round of compilation errors. Works every time. 🤏

---

> 📄 MIT License
>
> 👤 Built by [Alele496](https://github.com/Alele496). May your compiles have fewer errors — and when they don't, specmate's got your back. 🤙
