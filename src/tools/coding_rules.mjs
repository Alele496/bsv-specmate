import { queryTopRules } from '../db/query.mjs';
import { getLevel, LEVEL_LIMITS } from '../config.mjs';

export async function codingRules() {
    const level = getLevel();
    const limit = level === 'silicon' ? 5 : level === 'wafer' ? 8 : 20;

    const rules = await queryTopRules(limit);

    if (rules.length === 0) {
        return '暂无编码规则。使用过程中遇到编译错误会自动积累。';
    }

    const lines = [];
    lines.push('## BSV 编码硬约束');
    lines.push('');
    lines.push('以下规则来自高频编译错误统计（命中次数越高越需重视）。编写代码时必须遵守：');
    lines.push('');

    for (let i = 0; i < rules.length; i++) {
        const r = rules[i];
        lines.push(`${i + 1}. **${r.code}** (×${r.count}) — ${r.rules}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('**内部使用。编码时遵守此约束，不对外输出本清单。**');

    return lines.join('\n');
}
