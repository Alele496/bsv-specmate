#!/usr/bin/env node
// specmate CLI — Agent-facing BSV development infrastructure
// Phase 1: CLI as primary channel. Agent calls `npx specmate scan/check`.
//
// Usage:
//   npx specmate scan <task-description> [--file=MyModule.bsv]
//   npx specmate check <files...>

import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { readFileSync } from 'fs';

// Resolve project root relative to this file
const __dirname = new URL('.', import.meta.url).pathname
  .replace(/\/+$/, '')
  .replace(/^\/([A-Z]:\/)/, '$1'); // Windows fix: /D:/... → D:/...
const PKG_ROOT = resolve(__dirname, '..');

// ── Lazy-import helpers ──
async function loadModule(relPath) {
  const absPath = resolve(PKG_ROOT, relPath);
  return await import(pathToFileURL(absPath).href);
}

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'help' || command === '--help' || command === '-h') {
  console.log('specmate — BSV 编码全周期平台');
  console.log('');
  console.log('Usage: npx specmate <command>');
  console.log('');
  console.log('Commands:');
  console.log('  scan  <task-description> [--file=MyModule.bsv]  Pre-code check: traps + decisions + preflight + next-steps');
  console.log('  check <files...>                                Quick static check (literal overflow, zero-width, Bool misuse)');
  console.log('');
  process.exit(0);
}

// Ensure data dir exists
try {
  const { initDataDir } = await loadModule('src/config.mjs');
  initDataDir();
} catch (_) { /* non-critical */ }

async function main() {
  switch (command) {
    case 'scan': {
      const { scan } = await loadModule('src/tools/specmate_guide.mjs');

      // Parse arguments: first non-flag after 'scan' is task description
      const flagArgs = args.slice(1).filter(a => a.startsWith('--'));
      const taskArgs = args.slice(1).filter(a => !a.startsWith('--'));
      const taskDescription = taskArgs.join(' ');

      if (!taskDescription) {
        console.log('Usage: npx specmate scan <task-description> [--file=MyModule.bsv]');
        console.log('Example: npx specmate scan "写一个 SPI 主控制器" --file=SPI_Master.bsv');
        process.exit(1);
      }

      const fileArg = flagArgs.find(a => a.startsWith('--file='));
      const filePath = fileArg ? resolve(fileArg.replace('--file=', '')) : null;

      const result = await scan(taskDescription, filePath);
      console.log(result);
      break;
    }
    case 'check': {
      const { checkStyle } = await loadModule('src/tools/check_style.mjs');

      const files = args.slice(1);
      if (files.length === 0) {
        console.log('Usage: npx specmate check <files...>');
        process.exit(1);
      }

      // Auto-init DB for captures (non-critical — fire-and-forget)
      let addCapture = null;
      try {
        const { addCapture: _addCapture } = await loadModule('src/db/query.mjs');
        addCapture = _addCapture;
      } catch (_) {}

      const results = checkStyle({ files, full: false });

      if (results.length === 0) {
        console.log('通过 — 未发现问题。');
      } else {
        console.log(`发现 ${results.length} 个问题:\n`);
        for (const r of results) {
          console.log(`[${r.check}] ${r.file}:${r.line} — ${r.message}`);
          console.log(`  建议: ${r.suggestion}\n`);
        }

        // Task 3: auto-capture check issues
        if (addCapture) {
          const codes = [...new Set(results.map(r => r.check))];
          for (const code of codes) {
            addCapture({ code, bsc_output: `check: ${results.filter(r => r.check === code).map(r => r.message).join('; ')}`, files: files.join(', ') })
              .catch(() => {});
          }
        }
      }
      break;
    }
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Usage: npx specmate <scan|check>');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('specmate error:', err.message);
  process.exit(1);
});
