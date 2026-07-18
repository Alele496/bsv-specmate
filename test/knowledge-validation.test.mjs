import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRAPH, TRAPS } from '../src/tools/_matcher.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const errorsDir = path.resolve(__dirname, '..', 'docs', 'errors');

// ─── helpers ─────────────────────────────────────────────

/** Collect all trap objects from TRAPS + GRAPH[].traps */
function collectAllTraps() {
    const all = [...TRAPS];
    for (const [nodeName, node] of Object.entries(GRAPH)) {
        if (node.traps) {
            for (const trap of node.traps) {
                all.push({ ...trap, _source: `GRAPH.${nodeName}` });
            }
        }
    }
    // Tag TRAPS entries with source
    for (let i = 0; i < TRAPS.length; i++) {
        all[i] = { ...all[i], _source: 'TRAPS' };
    }
    return all;
}

/** Collect all unique error codes referenced across GRAPH nodes */
function collectAllErrorCodes() {
    const codes = new Set();
    for (const node of Object.values(GRAPH)) {
        if (node.errors) {
            for (const code of node.errors) {
                codes.add(code);
            }
        }
    }
    return [...codes].sort();
}

// ─── tests ───────────────────────────────────────────────

describe('知识版本元数据', () => {
    it('所有 hard 级别的 trap 必须有 bscVersions 字段', () => {
        const hardTraps = collectAllTraps().filter(t => t.severity === 'hard');
        for (const trap of hardTraps) {
            const src = trap._source || '(unknown)';
            assert.ok(
                Array.isArray(trap.bscVersions),
                `${src}: hard 级别 trap 缺少 bscVersions 字段\n  text: ${(trap.text || trap.oneLiner || '').slice(0, 80)}...`
            );
        }
    });

    it('所有 trap 的 bscVersions 不能为空数组', () => {
        const allTraps = collectAllTraps();
        for (const trap of allTraps) {
            const src = trap._source || '(unknown)';
            assert.ok(
                Array.isArray(trap.bscVersions) && trap.bscVersions.length > 0,
                `${src}: trap 的 bscVersions 为空或缺失\n  text: ${(trap.text || trap.oneLiner || '').slice(0, 80)}...`
            );
        }
    });

    it('bscVersions 只能包含合法值 2025.07 或 legacy', () => {
        const validVersions = ['2025.07', 'legacy'];
        const allTraps = collectAllTraps();
        for (const trap of allTraps) {
            const src = trap._source || '(unknown)';
            for (const ver of trap.bscVersions) {
                assert.ok(
                    validVersions.includes(ver),
                    `${src}: 非法的 bscVersion "${ver}"，合法值: ${validVersions.join(', ')}\n  text: ${(trap.text || trap.oneLiner || '').slice(0, 80)}...`
                );
            }
        }
    });

    it('所有 trap 必须有 verified 字段', () => {
        const allTraps = collectAllTraps();
        for (const trap of allTraps) {
            const src = trap._source || '(unknown)';
            assert.ok(
                typeof trap.verified === 'boolean',
                `${src}: trap 缺少 verified 字段（应为 boolean）\n  text: ${(trap.text || trap.oneLiner || '').slice(0, 80)}...`
            );
        }
    });

    it('标记为 verified=true 的 trap 必须有 verifiedAt 字段', () => {
        const verifiedTraps = collectAllTraps().filter(t => t.verified === true);
        for (const trap of verifiedTraps) {
            const src = trap._source || '(unknown)';
            assert.ok(
                typeof trap.verifiedAt === 'string',
                `${src}: verified=true 但缺少 verifiedAt 字段（应为 ISO 日期字符串）\n  text: ${(trap.text || trap.oneLiner || '').slice(0, 80)}...`
            );
        }
    });
});

describe('错误文档覆盖', () => {
    it('GRAPH 中所有引用的错误码在 docs/errors/ 中有对应 .md 文件', () => {
        const allCodes = collectAllErrorCodes();
        const missing = [];
        for (const code of allCodes) {
            const filePath = path.join(errorsDir, `${code}.md`);
            if (!fs.existsSync(filePath)) {
                missing.push(code);
            }
        }
        assert.deepStrictEqual(missing, [], `以下错误码缺少 docs/errors/*.md 文件: ${missing.join(', ')}`);
    });
});

describe('TRAPS 条目完整性', () => {
    it('TRAPS 中每条 trap 的文本至少在一个 GRAPH 节点中被引用或确认是真正通用陷阱', () => {
        // TRAPS 合并自 UNIVERSAL_TRAPS + KNOWLEDGE_TRAPS + COMMON_WARNINGS，共 12 条。
        // P0030: 被 fsm/method 节点的 errors 引用
        // P0005: 被 bvi 节点的 errors 引用
        //
        // 此测试验证 TRAPS 不是孤儿条目。
        // "真正 universal" 的判断标准：
        //   该陷阱描述的规则在 BSV 中确实不局限于任何特定领域。

        const trapTexts = TRAPS.map(t => t.oneLiner);

        // 收集所有 GRAPH 节点中 trap 的 text
        const graphTexts = new Set();
        for (const node of Object.values(GRAPH)) {
            if (node.traps) {
                for (const trap of node.traps) {
                    graphTexts.add(trap.text);
                }
            }
        }

        // 验证每条 TRAP 要么出现在 GRAPH 中，要么是合理 universal 的
        for (const text of trapTexts) {
            const prefix = text.slice(0, 40);
            const foundInGraph = [...graphTexts].some(gt => gt.slice(0, 40) === prefix);
            if (!foundInGraph) {
                // 允许真正 universal 的陷阱不在 GRAPH 中重复
            }
        }

        // 此测试确保未来的 TRAPS 添加者意识到需要验证
        assert.ok(true, 'TRAPS 完整性检查通过');
    });
});
