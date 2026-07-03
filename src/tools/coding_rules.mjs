import { queryTopRules } from '../db/query.mjs';
import { getLevel } from '../config.mjs';

const INTRO = [
    '## specmate — BSV 知识引擎',
    '',
    '可用资源：',
    '· `coding_rules()` — 高频编译错误衍生的编码约束（你正在看）',
    '· `lookup_ref(topic)` — BSV 语法 / 标准库 / 调度标注 (schedule) / 设计模式',
    '· `lookup_example(keyword)` — 在 4,570 个官方用例中搜索正确写法',
    '· `check_style(files)` — 编译前静态预检（写完代码后可调用）',
    '· `lookup_error(code)` — 报错后查原因和方案',
    '',
    '场景建议：',
    '· 多模块 Top 集成 / G0004 → `lookup_ref(topic="schedule")` 查调度注解',
    '· 不确定 BSV 语法 → `lookup_ref(topic="tutorial")` 中文教程参考',
    '· 不确定标准库用法 → `lookup_ref(topic="stdlib")` 查标准库',
    '· 编完模块后 → `check_style(files)` 编译前检查',
    '',
    '视需要调用。',
    '',
    '---',
    '',
].join('\n');

export async function codingRules() {
    const level = getLevel();
    const limit = level === 'silicon' ? 5 : level === 'wafer' ? 8 : 20;

    const rules = await queryTopRules(limit);

    if (rules.length === 0) {
        return INTRO + '暂无编码规则。使用过程中遇到编译错误会自动积累。';
    }

    const lines = [];
    lines.push(INTRO);
    lines.push('## 编码硬约束');
    lines.push('');
    lines.push('以下规则来自高频编译错误统计（命中次数越高越需重视）：');
    lines.push('');

    for (let i = 0; i < rules.length; i++) {
        const r = rules[i];
        lines.push(`${i + 1}. **${r.code}** (×${r.count}) — ${r.rules}`);
    }

    return lines.join('\n');
}
