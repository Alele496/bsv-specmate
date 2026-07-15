#!/usr/bin/env node
// specmate CLI — Human-facing BSV development infrastructure
// Phase 2: Quality-enhanced review pipeline (L1/L2/L3 conflict detection)
//
// Usage:
//   npx specmate scan <task-description> [--file=MyModule.bsv]
//   npx specmate check <files...>
//   npx specmate example <keyword> [--dir=<subdirectory>]
//   npx specmate review                                    List pending items for review (with [CONFLICT] flag)
//   npx specmate review --show=<CODE>                      Show conflict details for a code
//   npx specmate review --approve=<CODE>                   Approve (blocked if CONFLICT exists)
//   npx specmate review --reject=<CODE>                    Reject
//   npx specmate review --resolve-conflict=<CODE> --keep=new|old|merge  Resolve conflict

import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

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
  console.log('  scan    <task-description> [--file=MyModule.bsv]  Pre-code check: traps + decisions + preflight + next-steps');
  console.log('  check   <files...>                                Quick static check (literal overflow, zero-width, Bool misuse)');
  console.log('  example <keyword> [--dir=<subdir>]                Search official BSC examples for keyword usage snippets');
  console.log('  review                                            List pending error clusters for human review');
  console.log('  review  --show=<CODE>                             Show conflict details for a code');
  console.log('  review  --approve=<CODE>                          Approve cluster: aggregate → draft → mark approved → seed');
  console.log('  review  --reject=<CODE>                           Reject cluster: mark as rejected');
  console.log('  review  --resolve-conflict=<CODE> --keep=new|old|merge  Resolve a semantic conflict');
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

      const results = checkStyle({ files, full: true });

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
    case 'example': {
      const { lookupExample } = await loadModule('src/tools/lookup_example.mjs');

      const keyword = args[1];
      if (!keyword) {
        console.log('Usage: npx specmate example <keyword> [--dir=<subdirectory>]');
        console.log('Example: npx specmate example mkFIFO');
        console.log('Example: npx specmate example mkFIFO --dir=bsc.scheduler');
        process.exit(1);
      }

      const dirArg = args.find(a => a.startsWith('--dir='));
      const directory = dirArg ? dirArg.replace('--dir=', '') : '';

      const result = lookupExample({ keyword, directory });
      console.log(result);
      break;
    }
    case 'review': {
      await runReview(args.slice(1));
      break;
    }
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Usage: npx specmate <scan|check|example|review>');
      process.exit(1);
  }
}

// ── Review command ──

async function runReview(reviewArgs) {
  // Parse flags
  const approveArg = reviewArgs.find(a => a.startsWith('--approve='));
  const rejectArg = reviewArgs.find(a => a.startsWith('--reject='));
  const showArg = reviewArgs.find(a => a.startsWith('--show='));
  const resolveConflictArg = reviewArgs.find(a => a.startsWith('--resolve-conflict='));
  const keepArg = reviewArgs.find(a => a.startsWith('--keep='));

  // Load DB modules
  const { queryClusteredCaptures, approveCapturesByCode, rejectCapturesByCode, queryAllCapturesByCode } = await loadModule('src/db/query.mjs');
  const { writeDraft, resolveConflict } = await loadModule('scripts/generate-error-doc.mjs');

  // Path to conflict drafts
  const draftsDir = resolve(PKG_ROOT, 'docs', 'errors', '_drafts');

  /**
   * Helper: read conflict file if it exists.
   * @param {string} code
   * @returns {string|null}
   */
  function readConflictFile(code) {
    const conflictPath = join(draftsDir, `${code}_CONFLICT.md`);
    if (existsSync(conflictPath)) {
      return readFileSync(conflictPath, 'utf-8');
    }
    return null;
  }

  if (showArg) {
    // ── Show conflict details sub-command ──
    const code = showArg.replace('--show=', '').trim();
    if (!code) {
      console.error('Error: --show requires an error code (e.g. --show=P0030)');
      process.exit(1);
    }

    const conflictContent = readConflictFile(code);
    if (!conflictContent) {
      console.log(`No conflict file found for ${code}.`);
      console.log('');
      console.log('To check pending clusters: npx specmate review');
      process.exit(0);
    }

    console.log('');
    console.log(`=== Conflict Details: ${code} ===`);
    console.log('');
    console.log(conflictContent);
    return;
  }

  if (resolveConflictArg) {
    // ── Resolve conflict sub-command ──
    const code = resolveConflictArg.replace('--resolve-conflict=', '').trim();
    if (!code) {
      console.error('Error: --resolve-conflict requires an error code (e.g. --resolve-conflict=P0030)');
      process.exit(1);
    }

    const keep = keepArg ? keepArg.replace('--keep=', '').trim() : '';
    if (!['new', 'old', 'merge'].includes(keep)) {
      console.error('Error: --keep must be one of: new, old, merge');
      console.error('Usage: npx specmate review --resolve-conflict=<CODE> --keep=new|old|merge');
      process.exit(1);
    }

    // Check if the conflict file exists
    const conflictContent = readConflictFile(code);
    if (!conflictContent) {
      console.error(`Error: No conflict file found for ${code}.`);
      console.error(`Check: ${join(draftsDir, `${code}_CONFLICT.md`)}`);
      process.exit(1);
    }

    // Get capture data for the resolution
    const captures = await queryAllCapturesByCode(code);
    if (captures.length === 0) {
      console.error(`Error: No captures found for code "${code}". Resolution requires capture data.`);
      process.exit(1);
    }

    const totalRepeat = captures.reduce((sum, c) => sum + (c.repeat_count || 1), 0);
    const sessions = new Set(captures.map(c => c.session_id).filter(Boolean));
    const sessionCount = sessions.size || 1;
    const samples = captures.map(c => c.bsc_output || '').join('\n---\n');
    const latestCause = [...captures].reverse().find(c => c.cause && c.cause.trim())?.cause || '';
    const latestSolution = [...captures].reverse().find(c => c.solution && c.solution.trim())?.solution || '';

    const result = resolveConflict(code, keep, {
      totalRepeat, sessionCount, samples, latestCause, latestSolution,
    });

    console.log(result.message);
    return;
  }

  if (approveArg) {
    // ── Approve sub-command ──
    const code = approveArg.replace('--approve=', '').trim();
    if (!code) {
      console.error('Error: --approve requires an error code (e.g. --approve=P0030)');
      process.exit(1);
    }

    // Check for unresolved conflict
    const conflictContent = readConflictFile(code);
    if (conflictContent) {
      console.error('');
      console.error(`Error: ${code} has an unresolved CONFLICT.`);
      console.error(`Conflicts must be resolved before approving.`);
      console.error('');
      console.error('Available actions:');
      console.error(`  npx specmate review --show=${code}                  View conflict details`);
      console.error(`  npx specmate review --resolve-conflict=${code} --keep=new|old|merge  Resolve conflict`);
      console.error('');
      process.exit(1);
    }

    console.log(`Approving error cluster: ${code}...`);

    // Step 1: Get all captures for this code
    const captures = await queryAllCapturesByCode(code);
    if (captures.length === 0) {
      console.error(`Error: No captures found for code "${code}"`);
      process.exit(1);
    }

    // Step 2: Aggregate for doc generation
    const totalRepeat = captures.reduce((sum, c) => sum + (c.repeat_count || 1), 0);
    const sessions = new Set(captures.map(c => c.session_id).filter(Boolean));
    const sessionCount = sessions.size || 1;
    const samples = captures.map(c => c.bsc_output || '').join('\n---\n');
    const latestCause = [...captures].reverse().find(c => c.cause && c.cause.trim())?.cause || '';
    const latestSolution = [...captures].reverse().find(c => c.solution && c.solution.trim())?.solution || '';

    // Step 3: Generate draft .md (L1/L2/L3 quality pipeline)
    const draftResult = writeDraft({ code, totalRepeat, sessionCount, samples, latestCause, latestSolution });

    if (draftResult.conflict === true) {
      // L2 caught a conflict — block approval
      console.log('');
      console.log(`CONFLICT detected: ${draftResult.filePath}`);
      console.log(`  Similarity: ${draftResult.similarity}`);
      console.log('');
      console.log('The conflict must be resolved before approving:');
      console.log(`  npx specmate review --show=${code}`);
      console.log(`  npx specmate review --resolve-conflict=${code} --keep=new|old|merge`);
      process.exit(1);
    }

    if (draftResult.conflict === 'gray') {
      console.log(`  NOTE: Gray zone detected — needs human review.`);
    }

    console.log(`  Draft: ${draftResult.filePath} (${draftResult.isAppend ? 'appended sub-scenario' : 'new'})`);

    // Step 4: Mark as approved in DB
    const { updated } = await approveCapturesByCode(code);
    console.log(`  DB: ${updated} capture(s) marked as approved`);

    // Step 5: Re-seed errors table
    console.log(`  Seeding errors table...`);
    try {
      const seedOutput = execSync('npm run db:seed', { cwd: PKG_ROOT, encoding: 'utf-8', timeout: 30000 });
      console.log(`  db:seed: ${seedOutput.trim().split('\n').pop()}`);
    } catch (e) {
      console.error(`  Warning: db:seed failed: ${e.message}`);
      console.error(`  You may need to run 'npm run db:seed' manually.`);
    }

    console.log(`\nApproval complete. Draft written to ${draftResult.filePath}`);
    console.log(`Review the draft content, then move it to docs/errors/ if ready.`);
    return;
  }

  if (rejectArg) {
    // ── Reject sub-command ──
    const code = rejectArg.replace('--reject=', '').trim();
    if (!code) {
      console.error('Error: --reject requires an error code (e.g. --reject=P0030)');
      process.exit(1);
    }

    console.log(`Rejecting error cluster: ${code}...`);
    const updated = await rejectCapturesByCode(code);
    console.log(`  ${updated} capture(s) marked as rejected`);
    return;
  }

  // ── List pending clusters (default behavior) ──
  const clusters = await queryClusteredCaptures();

  // Also check for conflict files for codes not in current clusters
  if (existsSync(draftsDir)) {
    const conflictFiles = readdirSync(draftsDir).filter(f => f.endsWith('_CONFLICT.md'));
    const conflictCodes = conflictFiles.map(f => f.replace('_CONFLICT.md', ''));

    // If there are clusters AND conflicts, mention conflicts
    if (conflictCodes.length > 0 && clusters.length === 0) {
      console.log('');
      console.log('Unresolved conflicts:');
      console.log('');
      console.log('CODE        STATUS');
      console.log('--------    ------');
      for (const c of conflictCodes) {
        console.log(`${c.padEnd(10)}  [CONFLICT]`);
      }
      console.log('');
      console.log(`Total: ${conflictCodes.length} unresolved conflict(s)`);
      console.log('');
      console.log('Actions:');
      console.log('  npx specmate review --show=<CODE>                  View conflict details');
      console.log('  npx specmate review --resolve-conflict=<CODE> --keep=new|old|merge  Resolve');
      return;
    }
  }

  if (clusters.length === 0) {
    console.log('No pending error clusters for review.');
    console.log('');
    console.log('Criteria: total repeat >= 3 across >= 2 sessions, status = unreviewed');
    console.log('Tip: clusters will appear here as Agent sessions accumulate capture data.');
    return;
  }

  // Collect conflict codes for flagging
  const conflictCodes = new Set();
  if (existsSync(draftsDir)) {
    const conflictFiles = readdirSync(draftsDir).filter(f => f.endsWith('_CONFLICT.md'));
    for (const f of conflictFiles) {
      conflictCodes.add(f.replace('_CONFLICT.md', ''));
    }
  }

  // Print table header
  console.log('');
  console.log('Pending error clusters for review:');
  console.log('');
  console.log('CODE         REPEATS  SESSIONS  SUMMARY');
  console.log('---------    -------  --------  -------');

  for (const c of clusters) {
    let code = (c.code || '???');
    const flag = conflictCodes.has(code) ? ' [CONFLICT]' : '';
    const paddedCode = (code + flag).padEnd(13);
    const repeats = String(c.total_repeat || 0).padStart(7);
    const sessions = String(c.session_count || 0).padStart(8);

    // Build brief summary from first sample line
    let summary = '';
    if (c.samples) {
      const firstSample = c.samples.split('---')[0].trim();
      const lines = firstSample.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.match(/^(File|".*", line|^\^+$)/i) && trimmed.length > 5) {
          summary = trimmed.length > 50 ? trimmed.substring(0, 47) + '...' : trimmed;
          break;
        }
      }
    }
    if (!summary) summary = c.latest_cause ? c.latest_cause.substring(0, 50) : '(no summary)';

    console.log(`${paddedCode} ${repeats}  ${sessions}  ${summary}`);
  }

  console.log('');
  console.log(`Total: ${clusters.length} cluster(s) pending`);

  if (conflictCodes.size > 0) {
    console.log(`Conflicts: ${conflictCodes.size} marked [CONFLICT] — resolve before approving`);
  }

  console.log('');
  console.log('Actions:');
  console.log('  npx specmate review --approve=<CODE>                Approve and generate draft');
  console.log('  npx specmate review --reject=<CODE>                 Reject and skip');
  console.log('  npx specmate review --show=<CODE>                  Show conflict details');
  console.log('  npx specmate review --resolve-conflict=<CODE> --keep=new|old|merge  Resolve conflict');
}

main().catch(err => {
  console.error('specmate error:', err.message);
  process.exit(1);
});
