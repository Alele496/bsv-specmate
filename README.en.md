# specmate

[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-specmate-red?style=flat-square&logo=npm)](https://www.npmjs.com/package/specmate)
[![GitHub License](https://img.shields.io/github/license/Alele496/bsv-specmate?style=flat-square)](https://github.com/Alele496/bsv-specmate/blob/main/LICENSE)

> BSV Coding Knowledge Engine — Your Bluespec coding mate.

[🇨🇳 中文版](./README.md)

`specmate` is a **BSV Coding Knowledge Engine** — a domain knowledge layer for AI agents writing Bluespec SystemVerilog. It bundles an accumulated error KB (9 entries, auto-counting), language reference docs (8 topics), design patterns (7 production paradigms), and 4,570 official test suite examples. Helps agents write BSV code that compiles on the first try.

BSV is a niche hardware description language. AI training data lags behind the latest compiler — outdated syntax, missing keywords, and subtle scheduling rules make first-try compilation rare. This project accumulates real compilation errors into a queryable knowledge base, so agents can avoid common pitfalls before they compile.

| Feature | Description | MCP Tool |
|---------|-------------|----------|
| **📋 Coding constraints** | SQLite-driven rules sorted by hit count, auto-evolve as errors accumulate | `coding_rules` |
| **🚀 Pre-coding prep** | Scan high-frequency errors + design warnings before writing | `preflight` |
| **🔍 Static check** | Regex-based detection: rule/method order, Bool misuse, SV reserved words, `vec()` trap, duplicate register writes | `check_style` |
| **📚 Error KB** | 9 real compilation errors with phenomena, cause, and solution; auto-increment on hit | `lookup_error` |
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

We pitted two agents against each other on a RISC-V peripheral subsystem —
7 modules, same requirements, one with specmate (tapeout), one without.

Result: 🅱️ The specmate-guided agent needed **25% fewer compilation fix rounds** (9 vs 12)
and **12.6% less tokens** (149.7K vs 171.3K). More interestingly — it was guided into
safer design choices: standard library FIFOs over hand-rolled ring buffers,
Bit#(1) over Bool for control signals, proactive scheduling annotations.

Full blow-by-blow → **[📖 Complete Showdown Report](docs/SHOWDOWN.md)**

---

## ⚡ Quick Start

### Install

```bash
npm install -g specmate
```

### Configure Claude Code

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "specmate": {
      "command": "npx",
      "args": ["specmate"]
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

| Level | Scenario | `coding_rules` | `preflight` | `check_style` | `lookup_example` |
|-------|----------|---------------|-------------|---------------|------------------|
| **`silicon`** | Quick edits | 5 rules | TOP 3 errors | errors only | 1 file / 15 lines |
| **`wafer`** (default) | Daily dev | 8 rules | TOP 5 + 3 warnings | errors + warnings | 3 files / 30 lines |
| **`tapeout`** | New modules | 20 rules | TOP 10 + all warnings + tips | all | 5 files / 50 lines |

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
│       ├── lookup_error.mjs    ← Error KB lookup
│       ├── lookup_ref.mjs      ← BSV reference docs
│       ├── lookup_example.mjs  ← Official example search
│       └── add_error.mjs       ← Contribute new errors
├── data/
│   └── knowledge.db       ← Seed DB (9 errors)
├── docs/
│   ├── BSV-STYLE.md       ← BSV coding conventions
│   ├── checklist.md       ← Pre-compilation checklist
│   ├── TUTORIAL.md        ← Usage tutorial
│   ├── errors/            ← Error docs (9 entries)
│   └── reference/         ← BSV language reference (4 topics)
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

Let's be real — most AI agents won't proactively reach for specmate.
They can write solid BSV code, but remembering "maybe I should check the reference" is a different story.

We're actively exploring better ways to integrate specmate naturally:
cross-references, scenario suggestions, the `suggest` tool… but we're not quite there yet 😅

We deliberately avoid hardcoding "you MUST call check_style after every module"
into AGENTS.md — today's experiment proved the point: when the template reads like
a checklist, agents start reporting "P0005 ✓, P0032 ✓" alongside every output,
polluting the conversation with self-review noise. Finding the sweet spot between
"helpful enough" and "not annoying" is the real challenge — that's why we've been
iterating on the template all day.

**In the meantime**, if you notice your agent hasn't touched a single specmate tool,
try dropping this in your conversation:

```
If you're unsure about any BSV syntax, feel free to try specmate's lookup_ref(topic="xxx") 🧠
```

(That's what we mean by "gentle nudge" — not a new prompt or system directive, just a friendly line in your ongoing chat. Agents sometimes forget what's in their toolbox.)

Same approach works for specific situations:

- Agent stuck on G0004 → "Maybe try lookup_ref(topic=\"schedule\") for scheduling annotations?"
- Agent unsure about a standard library function → "Would lookup_ref(topic=\"stdlib\") help?"
- Agent wrote code without review → "Want to run check_style on this?"

One sentence. Potentially one fewer compilation error. 🤏

(PRs welcome if you've discovered better nudging techniques 😄)

---

## 📄 License

MIT
