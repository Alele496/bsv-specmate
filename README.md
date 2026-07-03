# specmate

[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-specmate-red?style=flat-square&logo=npm)](https://www.npmjs.com/package/specmate)
[![GitHub License](https://img.shields.io/github/license/<user>/bsv-specmate?style=flat-square)](https://github.com/<user>/bsv-specmate/blob/main/LICENSE)

> Your Bluespec coding mate.

`specmate` is an MCP server for BSV (Bluespec SystemVerilog) development. It bundles an error knowledge base, language reference docs, 4,570 official test suite examples, and 7 MCP tools to help AI agents write BSV code that compiles on the first try.

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
- 🇨🇳 [中文 → README.zh-CN.md](./README.zh-CN.md)

---

## 🧪 Controlled Experiment

We ran an A/B test using OpenCode — two agents writing an identical Wishbone bus arbiter, one with specmate, one without.

| Metric | Agent A (no specmate) | Agent B (with specmate) |
|--------|----------------------|------------------------|
| Fix rounds to compile | **2** | **1** |
| Self-inflicted errors | `vec()` unbound (over-engineered Vector design) | None |
| Design style | Vector + Wire (complex, risky) | Flat Reg (conservative, safe) |
| Errors discovered | `priority` (SV reserved word) + `vec()` unbound | `priority` (SV reserved word) |
| KB growth | 2 new errors added | 1 new error added |

**Result**: specmate-guided agent compiled in 1 round. Unguided agent took 2 rounds due to self-inflicted complexity from an over-engineered design. Both newly discovered errors have since been added to the KB — the gap widens next time.

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
git clone https://github.com/<user>/bsv-specmate.git
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

## 📄 License

MIT
