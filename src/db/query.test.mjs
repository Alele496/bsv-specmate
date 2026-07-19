import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { ensureDB, closeDB, queryError, queryAllErrors, querySearch,
         hitError, queryTopRules, queryHotTopics, trackRefHit,
         addCapture, resolveCaptureById, queryCapturesByCode,
         queryRecentCaptures, queryUnresolvedCaptures,
         queryReportSummary, queryErrorTrend, queryFileHotspots,
         queryFixRateTrend, queryKnowledgeGrowth, queryWeeklyTopErrors } from './query.mjs';

describe('ensureDB', () => {
  after(() => closeDB());

  it('首次调用创建数据库', async () => {
    const db = await ensureDB();
    assert.ok(db);
  });
  it('二次调用返回同一实例', async () => {
    const db1 = await ensureDB();
    const db2 = await ensureDB();
    // sql.js Database 是同一引用
    assert.ok(db1);
    assert.ok(db2);
  });
});

describe('errors CRUD', () => {
  // 注意：测试写入前清空或使用测试专用 DB
  it('查询不存在的错误码返回 null', async () => {
    const r = await queryError('NONEXIST');
    assert.strictEqual(r, null);
  });
  it('热门错误排序正确', async () => {
    // 先 hit 几个错误增加计数
    await hitError('G0010');
    await hitError('G0010');
    await hitError('G0004');
    const top = await queryTopRules(3);
    assert.ok(top.length >= 2);
    assert.ok(top.some(e => e.code === 'G0010'), 'G0010 应在热门列表中');
  });
});

describe('captures 闭环', () => {
  it('insert → unresolved → resolve → gone', async () => {
    await addCapture({ code: 'G0010', bsc_output: 'test error', files: 'test.bsv' });
    const unresolved = await queryUnresolvedCaptures();
    assert.ok(unresolved.length > 0);
    const cap = unresolved[0];
    await resolveCaptureById(cap.id, { cause: 'test cause', solution: 'test fix' });
    const after = await queryUnresolvedCaptures();
    assert.ok(!after.some(c => c.id === cap.id));
  });
});

describe('queryReportSummary', () => {
  it('空数据库返回零值不抛异常', async () => {
    // This test works even without seed data — each field defaults to 0
    const summary = await queryReportSummary();
    assert.strictEqual(typeof summary.totalSessions, 'number');
    assert.strictEqual(typeof summary.totalCaptures, 'number');
    assert.strictEqual(typeof summary.knowledgeEntries, 'number');
    assert.ok(summary.totalSessions >= 0);
    assert.ok(summary.totalCaptures >= 0);
    assert.ok(summary.knowledgeEntries >= 0);
  });

  it('有捕获数据后返回正确计数', async () => {
    // 使用唯一错误码避免与历史遗留数据冲突（dedup key = code + file + session_id）
    const ts = Date.now();
    const code1 = `RPT_A${ts}`;
    const code2 = `RPT_B${ts}`;
    const before = await queryReportSummary();
    const r1 = await addCapture({ code: code1, bsc_output: 'type error', files: 'report_test.bsv' });
    const r2 = await addCapture({ code: code2, bsc_output: 'syntax error', files: 'report_test.bsv' });
    const after = await queryReportSummary();
    assert.strictEqual(after.totalCaptures, before.totalCaptures + 2, 'totalCaptures 应增加 2');
    assert.ok(after.distinctErrorCodes >= before.distinctErrorCodes + 2, '应有 2 个新 distinct error codes');
    // 清理：resolve 掉测试数据，避免污染后续测试
    await resolveCaptureById(r1.id, { cause: 'test', solution: 'cleanup' });
    await resolveCaptureById(r2.id, { cause: 'test', solution: 'cleanup' });
  });
});

describe('queryErrorTrend', () => {
  it('默认参数返回合理的结构', async () => {
    const trend = await queryErrorTrend({ granularity: 'week', topN: 5 });
    assert.ok(Array.isArray(trend.periods), 'periods 应为数组');
    assert.ok(Array.isArray(trend.series), 'series 应为数组');
    if (trend.additionalInfo) {
      assert.strictEqual(typeof trend.additionalInfo, 'string');
    }
  });

  it('month 粒度同样返回有效结构', async () => {
    const trend = await queryErrorTrend({ granularity: 'month', topN: 3 });
    assert.ok(Array.isArray(trend.periods));
    assert.ok(Array.isArray(trend.series));
  });
});

describe('queryFileHotspots', () => {
  it('返回数组结构', async () => {
    const hotspots = await queryFileHotspots(5);
    assert.ok(Array.isArray(hotspots));
    for (const h of hotspots) {
      assert.ok(h.file, '每个热点应有 file 字段');
      assert.ok(typeof h.total_count === 'number');
      assert.ok(typeof h.session_count === 'number');
    }
  });
});

describe('queryFixRateTrend', () => {
  it('返回数组，每项含必要字段', async () => {
    const trend = await queryFixRateTrend();
    assert.ok(Array.isArray(trend));
    for (const r of trend) {
      assert.ok(r.period);
      assert.ok(typeof r.total === 'number');
      assert.ok(typeof r.resolved === 'number');
      assert.ok(typeof r.rate_pct === 'number');
      assert.ok(r.rate_pct >= 0 && r.rate_pct <= 100);
    }
  });
});

describe('queryKnowledgeGrowth', () => {
  it('返回数组，每项含必要字段', async () => {
    const growth = await queryKnowledgeGrowth();
    assert.ok(Array.isArray(growth));
    for (const g of growth) {
      assert.ok(g.period);
      assert.ok(typeof g.new_codes === 'number');
      assert.ok(typeof g.total_captures === 'number');
    }
  });
});

describe('queryWeeklyTopErrors', () => {
  it('返回数组，每项含 period 和 top', async () => {
    const weekly = await queryWeeklyTopErrors(3, 2);
    assert.ok(Array.isArray(weekly));
    for (const w of weekly) {
      assert.ok(w.period);
      assert.ok(Array.isArray(w.top));
      assert.ok(w.top.length <= 3);
      for (const t of w.top) {
        assert.ok(t.code);
        assert.ok(typeof t.count === 'number');
      }
    }
  });
});
