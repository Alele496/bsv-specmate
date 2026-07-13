/* @dormant -- push flags removed from config.mjs in Phase 1, functions are no-op shells.
 * SPP (Specmate Push Protocol) notification functions are kept for backward
 * compatibility. All information delivery is now through CLI stdout and MCP
 * response text — channels the Agent always sees.
 *
 * The push flag fields (pushPreCode, pushCheckStyle, etc.) have been removed
 * from config.mjs LEVEL_LIMITS. shouldPush() always returns falsy.
 */

// Alert generation — transforms tool results into push notifications.
// Each function mirrors a specmate tool and extracts push-worthy signals.

import { sendAlert, sendMemory, sendDiff } from '../notify.mjs'
import { getLevel, LEVEL_LIMITS } from '../config.mjs'
import { inferPhase } from '../tools/_matcher.mjs'

function shouldPush(flag) {
  const cfg = LEVEL_LIMITS[getLevel()]
  return cfg && cfg[flag]
}

/**
 * After specmate_guide(pre_code) — push design-level traps as alerts.
 *
 * Pillar 2: phase-aware filtering.
 * Only pushes traps whose `phase` matches the inferred Agent stage.
 * This prevents "Bit#(1) 不用 Bool" from interrupting architecture design.
 */
export function onPreCode(traps, input) {
  if (!shouldPush('pushPreCode')) return
  if (!traps || traps.length === 0) return

  const agentPhase = inferPhase(input);

  for (const t of traps) {
    // Phase gate: only push if trap phase matches Agent's current phase
    // Traps without a phase (legacy) or with phase='both' pass through
    if (t.phase && t.phase !== agentPhase && t.phase !== 'both') continue;

    sendAlert({
      level: t.level || 'warn',
      code: t.code || 'TRAP',
      title: t.title || '设计陷阱',
      detail: t.detail || t,
      suggestion: t.fix || t.suggestion,
      source: 'guide:pre_code',
    });
  }
}

/**
 * After specmate_guide(pattern) — push code skeleton traps.
 */
export function onPattern(traps, patternName) {
  if (!shouldPush('pushPreCode')) return
  if (!traps || traps.length === 0) return
  for (const t of traps) {
    sendAlert({
      level: 'warn',
      code: 'PATTERN',
      title: `[${patternName}] ${t.title || '范式陷阱'}`,
      detail: t.detail || t,
      suggestion: t.fix || t.suggestion,
      source: 'guide:pattern',
    });
  }
}

/**
 * After specmate_check — push high-severity check issues as alerts.
 * Only push if there are issues (empty = clean = no alert needed).
 */
export function onCheckStyle(results, files) {
  if (!shouldPush('pushCheckStyle')) return
  if (!results || results.length === 0) return
  const critical = results.filter(r => r.severity === 'error' || r.check === 'P0032');
  const batch = (critical.length > 0 ? critical : results).slice(0, 5); // max 5 alerts per check

  for (const r of batch) {
    sendAlert({
      level: r.severity === 'error' ? 'error' : 'warn',
      code: r.check,
      title: `${r.file}:${r.line} — ${r.check}`,
      detail: r.message,
      suggestion: r.suggestion,
      file: r.file,
      line: r.line,
      source: 'check_style',
    });
  }
}

/**
 * After specmate_capture — push newly recorded error codes.
 */
export function onCapture(codes) {
  if (!shouldPush('pushOnError')) return
  if (!codes || codes.length === 0) return
  for (const code of codes) {
    sendAlert({
      level: 'error',
      code,
      title: `编译错误: ${code}`,
      detail: `错误码 ${code} 已记录。编译通过后用 specmate_resolve 保存修复经验。`,
      source: 'capture',
    });
  }
}

/**
 * After specmate_resolve — check if this error code has a history
 * of repeated occurrences (project memory match).
 */
export async function onResolve(code, cause, solution, queryFn) {
  if (!shouldPush('pushOnError')) return
  // If there are prior captures of the same code, push memory reminder
  try {
    if (queryFn) {
      const prior = await queryFn(code);
      if (prior && prior.count > 1) {
        sendMemory({
          code,
          history: prior.history || `此错误码出现过 ${prior.count} 次`,
          count: prior.count,
          lastFix: solution,
          action: 'remind',
        });
      }
    }
  } catch (_) { /* non-critical */ }
}

/**
 * After specmate_diff — push warning changes.
 */
export function onDiff({ added, removed, persistent }) {
  if (!shouldPush('pushDiff')) return
  if (added.length === 0 && removed.length === 0) return
  sendDiff({ added, removed, persistent });

  if (added.length > 0) {
    for (const w of added.slice(0, 3)) {
      sendAlert({
        level: 'warn',
        code: w.code,
        title: `新增 warning: ${w.code}`,
        detail: `${w.file}:${w.line} — ${w.message}`,
        file: w.file,
        line: w.line,
        source: 'diff',
      });
    }
  }
}

/**
 * After specmate_analyze — push scheduling conflict findings.
 */
export function onAnalyzeConflicts(conflicts, file) {
  if (!shouldPush('pushAnalyze')) return
  if (!conflicts || conflicts.length === 0) return
  for (const c of conflicts.slice(0, 5)) {
    const severity = c.severity || c.risk || 'medium';
    const level = severity === 'critical' ? 'error' : 'warn';
    sendAlert({
      level,
      code: c.type === 'cross-rule' ? 'G0010' : 'G0004',
      title: `调度冲突: ${c.rule1 || c.rule} ${c.rule2 ? 'vs ' + c.rule2 : ''}`,
      detail: c.detail || c.message || JSON.stringify(c),
      file,
      source: 'analyze',
    });
  }
}
