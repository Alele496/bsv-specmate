export function insertError(db, { code, title, keywords, phenomena, cause, solution, rules = '', count = 1, severity = 'compile', source = 'specmate' }) {
    db.run(
        `INSERT OR REPLACE INTO errors (code, title, keywords, phenomena, cause, solution, rules, count, severity, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, title, keywords, phenomena, cause, solution, rules, count, severity, source]
    );
}

export function incrementRefHit(db, topic) {
    db.run(
        `INSERT INTO ref_hits (topic, count) VALUES (?, 1)
         ON CONFLICT(topic) DO UPDATE SET count = count + 1`,
        [topic]
    );
}

export function getHotTopics(db, limit = 5) {
    const results = [];
    const stmt = db.prepare('SELECT topic, count FROM ref_hits ORDER BY count DESC LIMIT ?');
    stmt.bind([limit]);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function getError(db, code) {
    const stmt = db.prepare('SELECT * FROM errors WHERE code = ?');
    stmt.bind([code]);
    let row = null;
    if (stmt.step()) {
        row = stmt.getAsObject();
    }
    stmt.free();
    return row && row.code ? row : null;
}

export function getAllErrors(db) {
    const results = [];
    const stmt = db.prepare('SELECT code, title, keywords, count FROM errors ORDER BY count DESC');
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function getTopRules(db, limit) {
    const results = [];
    const stmt = db.prepare(
        'SELECT code, title, count, rules FROM errors WHERE rules IS NOT NULL AND rules != "" ORDER BY count DESC LIMIT ?'
    );
    stmt.bind([limit]);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function searchErrors(db, keyword) {
    const results = [];
    const stmt = db.prepare(
        `SELECT code, title, keywords FROM errors
         WHERE keywords LIKE ? OR title LIKE ? OR code LIKE ?
         LIMIT 5`
    );
    const kw = `%${keyword}%`;
    stmt.bind([kw, kw, kw]);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function incrementCount(db, code) {
    db.run('UPDATE errors SET count = count + 1 WHERE code = ?', [code]);
}

export function insertCapture(db, { code, timestamp, bsc_output, files, status = 'unresolved' }) {
    db.run(
        `INSERT INTO captures (code, timestamp, bsc_output, files, status)
         VALUES (?, ?, ?, ?, ?)`,
        [code, timestamp, bsc_output, files || null, status]
    );
}

/**
 * Extract a key token from bsc_output for error clustering.
 * Regex: Unexpected\s+(?:identifier\s+)?`(\w+)`
 * Returns the captured token or null.
 */
export function extractErrorToken(bsc_output) {
    const m = bsc_output.match(/Unexpected\s+(?:identifier\s+)?`(\w+)`/);
    return m ? m[1] : null;
}

/**
 * Upsert a capture record. If a capture with the same (code, file, session_id)
 * already exists with status='unresolved', increment its repeat_count instead of
 * inserting a new row.
 * @returns {{ id: number, deduped: boolean, repeat_count: number }}
 */
export function upsertCapture(db, { code, timestamp, bsc_output, files, status = 'unresolved', file = null, source = 'bsc', session_id = null }) {
    const error_token = extractErrorToken(bsc_output);

    // Check for existing unresolved capture with same dedup key
    const stmt = db.prepare(
        `SELECT id, repeat_count FROM captures
         WHERE code = ? AND file IS ? AND session_id IS ? AND status = 'unresolved'
         LIMIT 1`
    );
    stmt.bind([code, file, session_id]);
    let existing = null;
    if (stmt.step()) existing = stmt.getAsObject();
    stmt.free();

    if (existing) {
        // Dedup: increment repeat_count on the existing row
        const newCount = existing.repeat_count + 1;
        db.run('UPDATE captures SET repeat_count = ?, error_token = COALESCE(error_token, ?) WHERE id = ?', [newCount, error_token, existing.id]);
        return { id: existing.id, deduped: true, repeat_count: newCount };
    }

    // New capture
    db.run(
        `INSERT INTO captures (code, timestamp, bsc_output, files, file, source, session_id, error_token, status, repeat_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [code, timestamp, bsc_output, files || null, file, source, session_id, error_token, status]
    );
    const result = db.exec('SELECT last_insert_rowid()');
    const id = result[0].values[0][0];
    return { id, deduped: false, repeat_count: 1 };
}

export function createSession(db, { id, task_name = null, started_at, phase = null }) {
    db.run(
        `INSERT OR REPLACE INTO sessions (id, task_name, started_at, phase)
         VALUES (?, ?, ?, ?)`,
        [id, task_name, started_at, phase]
    );
}

export function setSessionPhase(db, id, phase) {
    db.run(`UPDATE sessions SET phase = ? WHERE id = ?`, [phase, id]);
}

export function getSessionPhase(db, id) {
    const stmt = db.prepare('SELECT phase FROM sessions WHERE id = ?');
    stmt.bind([id]);
    let phase = null;
    if (stmt.step()) {
        const obj = stmt.getAsObject();
        phase = obj.phase || null;
    }
    stmt.free();
    return phase;
}

export function endSession(db, id) {
    db.run(
        `UPDATE sessions SET ended_at = ? WHERE id = ?`,
        [new Date().toISOString(), id]
    );
}

export function resolveCapture(db, id, { cause, solution }) {
    db.run(
        `UPDATE captures SET cause = ?, solution = ?, status = 'resolved' WHERE id = ?`,
        [cause, solution, id]
    );
}

export function getCapturesByCode(db, code, limit = 5) {
    const results = [];
    const stmt = db.prepare(
        'SELECT * FROM captures WHERE code = ? ORDER BY id DESC LIMIT ?'
    );
    stmt.bind([code, limit]);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

export function getRecentCaptures(db, limit = 10) {
    const results = [];
    const stmt = db.prepare(
        'SELECT * FROM captures ORDER BY id DESC LIMIT ?'
    );
    stmt.bind([limit]);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

export function getUnresolvedCaptures(db) {
    const results = [];
    const stmt = db.prepare(
        "SELECT * FROM captures WHERE status = 'unresolved' ORDER BY id DESC"
    );
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

export function getLatestUnresolvedByCode(db, code) {
    const stmt = db.prepare(
        "SELECT * FROM captures WHERE code = ? AND status = 'unresolved' ORDER BY id DESC LIMIT 1"
    );
    stmt.bind([code]);
    let row = null;
    if (stmt.step()) row = stmt.getAsObject();
    stmt.free();
    return row;
}

export function insertWarning(db, { snapshot_id, timestamp, file, line, code, message }) {
    db.run(
        `INSERT OR IGNORE INTO warnings (snapshot_id, timestamp, file, line, code, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [snapshot_id, timestamp, file, line, code, message]
    );
}

export function getWarningsBySnapshot(db, snapshot_id) {
    const results = [];
    const stmt = db.prepare(
        'SELECT * FROM warnings WHERE snapshot_id = ? ORDER BY file, line'
    );
    stmt.bind([snapshot_id]);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

export function getLatestSnapshots(db, limit = 2) {
    const results = [];
    const stmt = db.prepare(
        'SELECT DISTINCT snapshot_id, MIN(timestamp) as timestamp FROM warnings GROUP BY snapshot_id ORDER BY timestamp DESC LIMIT ?'
    );
    stmt.bind([limit]);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

// ── P1 statistics: session-level aggregation queries ──

/**
 * Get session-level statistics: compile attempts (distinct capture count) and unresolved error count.
 * @param {object} db - SQL.js database handle
 * @param {string} sessionId
 * @returns {{ compileAttempts: number, unresolvedCount: number }}
 */
export function getSessionStats(db, sessionId) {
    const stmt = db.prepare(
        `SELECT
            COUNT(*) as compile_attempts,
            SUM(CASE WHEN status = 'unresolved' THEN 1 ELSE 0 END) as unresolved_count
         FROM captures WHERE session_id = ?`
    );
    stmt.bind([sessionId]);
    let row = { compileAttempts: 0, unresolvedCount: 0 };
    if (stmt.step()) {
        const obj = stmt.getAsObject();
        row = { compileAttempts: obj.compile_attempts || 0, unresolvedCount: obj.unresolved_count || 0 };
    }
    stmt.free();
    return row;
}

/**
 * Get stubborn errors: capture entries whose repeat_count >= minCount within the given session.
 * These are error codes that keep reappearing despite Agent's fix attempts.
 * @param {object} db
 * @param {string} sessionId
 * @param {number} minCount - minimum repeat_count to qualify as stubborn (default 2)
 * @returns {Array<{ code: string, file: string, repeat_count: number }>}
 */
export function getStubbornErrors(db, sessionId, minCount = 2) {
    const results = [];
    const stmt = db.prepare(
        `SELECT code, file, MAX(repeat_count) as repeat_count
         FROM captures
         WHERE session_id = ? AND repeat_count >= ?
         GROUP BY code, file
         ORDER BY repeat_count DESC`
    );
    stmt.bind([sessionId, minCount]);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Get fix rate for a session: how many captures have been resolved vs total.
 * @param {object} db
 * @param {string} sessionId
 * @returns {{ resolved: number, total: number }}
 */
export function getFixRate(db, sessionId) {
    const stmt = db.prepare(
        `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
         FROM captures WHERE session_id = ?`
    );
    stmt.bind([sessionId]);
    let row = { resolved: 0, total: 0 };
    if (stmt.step()) {
        const obj = stmt.getAsObject();
        row = { resolved: obj.resolved || 0, total: obj.total || 0 };
    }
    stmt.free();
    return row;
}

// ── Cross-session aggregation queries (Phase 0) ──

/**
 * Get total occurrence count and distinct session count for a specific error code.
 * "该错误码已累计 N 次（跨 M 个 session）"
 * @param {object} db
 * @param {string} code
 * @returns {{ totalCount: number, sessionCount: number }}
 */
export function getErrorCodeStats(db, code) {
    const stmt = db.prepare(
        `SELECT
            COUNT(*) as total_count,
            COUNT(DISTINCT session_id) as session_count
         FROM captures WHERE code = ?`
    );
    stmt.bind([code]);
    let row = { totalCount: 0, sessionCount: 0 };
    if (stmt.step()) {
        const obj = stmt.getAsObject();
        row = { totalCount: obj.total_count || 0, sessionCount: obj.session_count || 0 };
    }
    stmt.free();
    return row;
}

/**
 * Get TOP N most frequently captured error codes (cross-session).
 * @param {object} db
 * @param {number} limit
 * @returns {Array<{ code: string, total_count: number, session_count: number }>}
 */
export function getTopErrorCodes(db, limit = 5) {
    const results = [];
    const stmt = db.prepare(
        `SELECT
            code,
            COUNT(*) as total_count,
            COUNT(DISTINCT session_id) as session_count
         FROM captures
         GROUP BY code
         ORDER BY total_count DESC
         LIMIT ?`
    );
    stmt.bind([limit]);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Get TOP N error codes for given file basenames (cross-session hot tracking).
 * Matches captures whose `files` field contains the basename via LIKE.
 * Merges results across all provided files, taking the top N by total_count.
 * @param {object} db
 * @param {string[]} files - array of file paths (basename extracted internally)
 * @param {number} limit - max results (default 3)
 * @returns {Array<{ code: string, total_count: number, session_count: number }>}
 */
export function getFileTopErrors(db, files, limit = 3) {
    // Aggregate: code → { total_count, session_ids: Set }
    const agg = {};

    for (const f of files) {
        // Extract basename from path (cross-platform)
        const name = f.replace(/^.*[/\\]/, '');
        const stmt = db.prepare(
            `SELECT
                code,
                COUNT(*) as total_count,
                COUNT(DISTINCT session_id) as session_count
             FROM captures
             WHERE files LIKE '%' || ? || '%'
             GROUP BY code
             ORDER BY total_count DESC
             LIMIT ?`
        );
        stmt.bind([name, limit]);
        while (stmt.step()) {
            const row = stmt.getAsObject();
            if (!agg[row.code]) {
                agg[row.code] = { total: 0, sessions: new Set() };
            }
            agg[row.code].total += row.total_count;
            // session_count from each file query is partial; we use the max as a heuristic
            agg[row.code].sessions.add(row.session_count);
        }
        stmt.free();
    }

    // Convert to sorted array
    const results = Object.entries(agg)
        .map(([code, data]) => ({
            code,
            total_count: data.total,
            // Use the sum of session_counts across files as an approximation
            // of cross-session spread
            session_count: Math.max(...data.sessions),
        }))
        .sort((a, b) => b.total_count - a.total_count)
        .slice(0, limit);

    return results;
}

/**
 * Get count of unresolved captures (cross-session).
 * @param {object} db
 * @returns {number}
 */
export function getUnresolvedCount(db) {
    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM captures WHERE status = 'unresolved'");
    let count = 0;
    if (stmt.step()) {
        count = stmt.getAsObject().cnt || 0;
    }
    stmt.free();
    return count;
}

// ── Phase 1: auto-cluster + review CLI ──

/**
 * Get clustered captures grouped by error code for review.
 * Criteria: repeat_count >= minRepeatCount AND count(distinct session_id) >= minSessions
 * Only returns unreviewed captures.
 * @param {object} db
 * @param {number} minRepeatCount - minimum total repeat_count (default 3)
 * @param {number} minSessions - minimum distinct sessions (default 2)
 * @returns {Array<{ code, total_repeat, session_count, files, samples, latest_cause, latest_solution }>}
 */
export function getClusteredCaptures(db, minRepeatCount = 3, minSessions = 2) {
    const results = [];
    const stmt = db.prepare(
        `SELECT
            code,
            SUM(repeat_count) as total_repeat,
            COUNT(DISTINCT session_id) as session_count,
            GROUP_CONCAT(DISTINCT files) as files,
            GROUP_CONCAT(bsc_output, '\n---\n') as samples,
            (SELECT cause FROM captures c2 WHERE c2.code = captures.code AND c2.cause IS NOT NULL AND c2.cause != '' ORDER BY c2.id DESC LIMIT 1) as latest_cause,
            (SELECT solution FROM captures c2 WHERE c2.code = captures.code AND c2.solution IS NOT NULL AND c2.solution != '' ORDER BY c2.id DESC LIMIT 1) as latest_solution
         FROM captures
         WHERE review_status = 'unreviewed'
         GROUP BY code
         HAVING SUM(repeat_count) >= ? AND COUNT(DISTINCT session_id) >= ?
         ORDER BY total_repeat DESC`
    );
    stmt.bind([minRepeatCount, minSessions]);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Update review_status for all captures with the given error code.
 * @param {object} db
 * @param {string} code - error code
 * @param {string} status - 'approved' or 'rejected'
 * @returns {number} number of rows updated
 */
export function setCaptureReviewStatus(db, code, status) {
    db.run(
        `UPDATE captures SET review_status = ?, reviewed_at = ? WHERE code = ?`,
        [status, new Date().toISOString(), code]
    );
    const result = db.exec('SELECT changes()');
    return result[0].values[0][0];
}

/**
 * Get all captures for a specific error code, ordered by most recent first.
 * @param {object} db
 * @param {string} code
 * @returns {Array<object>}
 */
export function getAllCapturesByCode(db, code) {
    const results = [];
    const stmt = db.prepare(
        'SELECT * FROM captures WHERE code = ? ORDER BY id DESC'
    );
    stmt.bind([code]);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

// ── Q4: cross-session advanced analytics (specmate_report) ──

/**
 * Get a high-level summary of the entire knowledge base.
 * @param {object} db
 * @returns {{ totalSessions: number, activeSessions: number, totalCaptures: number,
 *             distinctErrorCodes: number, resolvedCaptures: number, knowledgeEntries: number }}
 */
export function getReportSummary(db) {
    const stmt = db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM sessions) as total_sessions,
            (SELECT COUNT(*) FROM sessions WHERE ended_at IS NULL) as active_sessions,
            (SELECT COUNT(*) FROM captures) as total_captures,
            (SELECT COUNT(DISTINCT code) FROM captures) as distinct_error_codes,
            (SELECT COUNT(*) FROM captures WHERE status = 'resolved') as resolved_captures,
            (SELECT COUNT(*) FROM errors) as knowledge_entries
    `);
    let row = { total_sessions: 0, active_sessions: 0, total_captures: 0, distinct_error_codes: 0, resolved_captures: 0, knowledge_entries: 0 };
    if (stmt.step()) {
        const obj = stmt.getAsObject();
        row = obj;
    }
    stmt.free();
    return {
        totalSessions: row.total_sessions || 0,
        activeSessions: row.active_sessions || 0,
        totalCaptures: row.total_captures || 0,
        distinctErrorCodes: row.distinct_error_codes || 0,
        resolvedCaptures: row.resolved_captures || 0,
        knowledgeEntries: row.knowledge_entries || 0,
    };
}

/**
 * Get error trend data over time (by week or month) for the TOP N error codes.
 * @param {object} db
 * @param {object} opts
 * @param {'week'|'month'} opts.granularity - 'week' (strftime '%Y-W%W') or 'month' (strftime '%Y-%m')
 * @param {number} opts.topN - how many top error codes to include
 * @returns {{ periods: string[], series: Array<{ code: string, values: Array<{ period: string, count: number }> }>,
 *             additionalInfo?: string }}
 */
export function getErrorTrend(db, { granularity = 'week', topN = 5 }) {
    const periodFormat = granularity === 'month'
        ? "%Y-%m"
        : "%Y-W%W";

    // 1. Find TOP N error codes by total occurrence
    const topStmt = db.prepare(
        `SELECT code, COUNT(*) as total
         FROM captures
         GROUP BY code
         ORDER BY total DESC
         LIMIT ?`
    );
    topStmt.bind([topN]);
    const topCodes = [];
    while (topStmt.step()) {
        topCodes.push(topStmt.getAsObject().code);
    }
    topStmt.free();

    if (topCodes.length === 0) {
        return { periods: [], series: [], additionalInfo: '暂无捕获数据。' };
    }

    // 2. Collect all periods for ordering
    const periodRows = [];
    const periodStmt = db.prepare(
        `SELECT DISTINCT strftime('${periodFormat}', timestamp) as period
         FROM captures
         WHERE code IN (${topCodes.map(() => '?').join(',')})
         ORDER BY period`
    );
    periodStmt.bind(topCodes);
    while (periodStmt.step()) {
        const p = periodStmt.getAsObject().period;
        periodRows.push(p);
    }
    periodStmt.free();

    const periods = periodRows;

    if (periods.length < 2) {
        return {
            periods,
            series: [],
            additionalInfo: '数据不足，需要至少 2 个周期才能显示趋势变化。',
        };
    }

    // 3. For each top code, get counts per period
    const series = [];
    for (const code of topCodes) {
        const valuesMap = {};
        const codeStmt = db.prepare(
            `SELECT strftime('${periodFormat}', timestamp) as period, COUNT(*) as count
             FROM captures
             WHERE code = ?
             GROUP BY period
             ORDER BY period`
        );
        codeStmt.bind([code]);
        while (codeStmt.step()) {
            const row = codeStmt.getAsObject();
            valuesMap[row.period] = row.count;
        }
        codeStmt.free();

        const values = periods.map(p => ({
            period: p,
            count: valuesMap[p] || 0,
        }));
        series.push({ code, values });
    }

    return { periods, series };
}

/**
 * Get file hotspots: files with the most captures, with session spread and error codes.
 * @param {object} db
 * @param {number} limit
 * @returns {Array<{ file: string, total_count: number, session_count: number, error_codes: string }>}
 */
export function getFileHotspots(db, limit = 10) {
    const results = [];
    const stmt = db.prepare(
        `SELECT file, COUNT(*) as total_count, COUNT(DISTINCT session_id) as session_count,
                GROUP_CONCAT(DISTINCT code) as error_codes
         FROM captures WHERE file IS NOT NULL AND file != ''
         GROUP BY file ORDER BY total_count DESC LIMIT ?`
    );
    stmt.bind([limit]);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Get fix rate trend over time (by week).
 * @param {object} db
 * @returns {Array<{ period: string, total: number, resolved: number, rate_pct: number }>}
 */
export function getFixRateTrend(db) {
    const results = [];
    const stmt = db.prepare(
        `SELECT strftime('%Y-W%W', timestamp) as period,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
         FROM captures
         GROUP BY period
         ORDER BY period`
    );
    while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
            period: row.period,
            total: row.total || 0,
            resolved: row.resolved || 0,
            rate_pct: row.total > 0 ? Number(((row.resolved / row.total) * 100).toFixed(1)) : 0,
        });
    }
    stmt.free();
    return results;
}

/**
 * Get knowledge growth over time (by week): new distinct error codes and total captures per week.
 * @param {object} db
 * @returns {Array<{ period: string, new_codes: number, total_captures: number }>}
 */
export function getKnowledgeGrowth(db) {
    const results = [];
    const stmt = db.prepare(
        `SELECT strftime('%Y-W%W', timestamp) as period,
                COUNT(DISTINCT code) as new_codes,
                COUNT(*) as total_captures
         FROM captures
         GROUP BY period
         ORDER BY period`
    );
    while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
            period: row.period,
            new_codes: row.new_codes || 0,
            total_captures: row.total_captures || 0,
        });
    }
    stmt.free();
    return results;
}

/**
 * Get TOP N error codes per week for the last N weeks.
 * Returns data grouped by week, each with TOP N error codes.
 * @param {object} db
 * @param {number} topN - top N per week
 * @param {number} weeks - number of recent weeks to look back
 * @returns {Array<{ period: string, top: Array<{ code: string, count: number }> }>}
 */
export function getWeeklyTopErrors(db, topN = 5, weeks = 4) {
    // Get recent distinct weeks
    const weekStmt = db.prepare(
        `SELECT DISTINCT strftime('%Y-W%W', timestamp) as period
         FROM captures
         ORDER BY period DESC
         LIMIT ?`
    );
    weekStmt.bind([weeks]);
    const recentWeeks = [];
    while (weekStmt.step()) {
        recentWeeks.push(weekStmt.getAsObject().period);
    }
    weekStmt.free();

    // Reverse to chronological order
    recentWeeks.reverse();

    const results = [];
    // For each week, query TOP N codes
    for (const period of recentWeeks) {
        const codeStmt = db.prepare(
            `SELECT code, COUNT(*) as count
             FROM captures
             WHERE strftime('%Y-W%W', timestamp) = ?
             GROUP BY code
             ORDER BY count DESC
             LIMIT ?`
        );
        codeStmt.bind([period, topN]);
        const top = [];
        while (codeStmt.step()) {
            top.push(codeStmt.getAsObject());
        }
        codeStmt.free();
        results.push({ period, top });
    }

    return results;
}

// ── Agent experience import (2026-07-20) ──
export function upsertError(db, { code, title, keywords, phenomena, cause, solution, rules = '', count = 1, severity = 'compile', source = 'specmate' }) {
    db.run(
        `INSERT INTO errors (code, title, keywords, phenomena, cause, solution, rules, count, severity, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
           title = excluded.title,
           keywords = excluded.keywords,
           phenomena = excluded.phenomena,
           cause = excluded.cause,
           solution = excluded.solution,
           rules = excluded.rules,
           count = excluded.count,
           severity = excluded.severity,
           source = excluded.source`,
        [code, title, keywords, phenomena, cause, solution, rules, count, severity, source]
    );
}

// ── Dashboard: session listing, capture pagination, error CRUD, import/export ──

export function listSessions(db) {
    const results = [];
    const stmt = db.prepare(
        'SELECT id, task_name, started_at, ended_at, compile_attempts, compile_failures, phase FROM sessions ORDER BY started_at DESC'
    );
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function listCaptures(db, { page = 1, pageSize = 20, status = null, code = null }) {
    const results = [];
    const conditions = [];
    const params = [];

    if (status) {
        conditions.push('status = ?');
        params.push(status);
    }
    if (code) {
        conditions.push('code = ?');
        params.push(code);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (page - 1) * pageSize;

    const stmt = db.prepare(
        `SELECT * FROM captures ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`
    );
    params.push(pageSize, offset);
    stmt.bind(params);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function countCaptures(db, { status = null, code = null }) {
    const conditions = [];
    const params = [];

    if (status) {
        conditions.push('status = ?');
        params.push(status);
    }
    if (code) {
        conditions.push('code = ?');
        params.push(code);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const stmt = db.prepare(`SELECT COUNT(*) as total FROM captures ${whereClause}`);
    stmt.bind(params);
    let total = 0;
    if (stmt.step()) {
        total = stmt.getAsObject().total || 0;
    }
    stmt.free();
    return total;
}

export function updateError(db, code, fields) {
    const setClauses = [];
    const params = [];

    if (fields.title !== undefined) {
        setClauses.push('title = ?');
        params.push(fields.title);
    }
    if (fields.cause !== undefined) {
        setClauses.push('cause = ?');
        params.push(fields.cause);
    }
    if (fields.solution !== undefined) {
        setClauses.push('solution = ?');
        params.push(fields.solution);
    }
    if (fields.keywords !== undefined) {
        setClauses.push('keywords = ?');
        params.push(fields.keywords);
    }
    if (fields.phenomena !== undefined) {
        setClauses.push('phenomena = ?');
        params.push(fields.phenomena);
    }
    if (fields.rules !== undefined) {
        setClauses.push('rules = ?');
        params.push(fields.rules);
    }

    if (setClauses.length === 0) return;

    params.push(code);
    db.run(`UPDATE errors SET ${setClauses.join(', ')} WHERE code = ?`, params);
}

export function deleteError(db, code) {
    db.run('DELETE FROM errors WHERE code = ?', [code]);
}

export function deleteCapture(db, id) {
    db.run('DELETE FROM captures WHERE id = ?', [id]);
}

export function exportKnowledge(db) {
    const errors = [];
    let stmt = db.prepare('SELECT * FROM errors');
    while (stmt.step()) {
        errors.push(stmt.getAsObject());
    }
    stmt.free();

    const captures = [];
    stmt = db.prepare('SELECT * FROM captures');
    while (stmt.step()) {
        captures.push(stmt.getAsObject());
    }
    stmt.free();

    return {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        errors,
        captures,
    };
}

export function importKnowledge(db, { errors, captures }) {
    let errorsImported = 0;
    let capturesImported = 0;

    db.run('BEGIN');

    try {
        if (errors && errors.length > 0) {
            const insertStmt = db.prepare(
                `INSERT OR REPLACE INTO errors (code, title, keywords, phenomena, cause, solution, rules, count, severity, source)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            for (const e of errors) {
                insertStmt.bind([e.code, e.title, e.keywords || '', e.phenomena || '', e.cause || '', e.solution || '', e.rules || '', e.count || 1, e.severity || 'compile', e.source || 'specmate']);
                insertStmt.step();
                insertStmt.reset();
                errorsImported++;
            }
            insertStmt.free();
        }

        if (captures && captures.length > 0) {
            const insertStmt = db.prepare(
                `INSERT OR IGNORE INTO captures (code, timestamp, bsc_output, files, file, source, session_id, error_token, repeat_count, cause, solution, status, review_status, reviewed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            for (const c of captures) {
                insertStmt.bind([
                    c.code, c.timestamp, c.bsc_output || '', c.files || null, c.file || null,
                    c.source || 'bsc', c.session_id || null, c.error_token || null,
                    c.repeat_count || 1, c.cause || null, c.solution || null,
                    c.status || 'unresolved', c.review_status || 'unreviewed', c.reviewed_at || null,
                ]);
                insertStmt.step();
                insertStmt.reset();
                capturesImported++;
            }
            insertStmt.free();
        }

        db.run('COMMIT');
    } catch (err) {
        db.run('ROLLBACK');
        throw err;
    }

    return { errorsImported, capturesImported };
}
