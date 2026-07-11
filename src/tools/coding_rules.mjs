import { queryTopRules } from '../db/query.mjs';
import { queryHotTopics } from '../db/query.mjs';
import { getLevel, LEVEL_LIMITS } from '../config.mjs';

const SILICON_INTRO = [
    '## specmate — BSV 知识引擎（硅基模式）',
    '',
    '可用工具：`coding_rules()` `lookup_ref(topic)` `lookup_example(keyword)` `check_style(files)` `lookup_error(code)`',
    '',
    '需要时叫我。',
    '',
    '---',
    '',
].join('\n');

const WAFER_INTRO = [
    '## specmate — BSV 知识引擎',
    '',
    '可用资源：',
    '· `coding_rules()` — 高频编译错误衍生的编码约束（你正在看）',
    '· `lookup_ref(topic)` — BSV 语法 / 标准库 / 调度标注 / 设计模式',
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

const TAPEOUT_INTRO = [
    '## 🤝 我是你的 BSV 编码搭档',
    '',
    '我会帮你盯着这些高频坑：命名冲突、Bool/Bit 混淆、多子模块调度、Vector 陷阱。',
    '编码过程中遇到任何 BSV 语法不确定性——不管是接口怎么定义、FIFO 怎么用、',
    '还是方案选哪个更好——随时来聊。我的价值不是你翻车后帮你修，',
    '是陪你写的时候让你少翻车。',
    '',
    '工具箱：`coding_rules()` `lookup_ref(topic)` `lookup_example(keyword)` `check_style(files)` `lookup_error(code)` `suggest(context)`',
    '',
    '---',
    '',
].join('\n');

function getIntro(level) {
    if (LEVEL_LIMITS[level].mode === 'passive') return SILICON_INTRO;
    if (LEVEL_LIMITS[level].mode === 'suggestive') return WAFER_INTRO;
    return TAPEOUT_INTRO;
}

export async function codingRules() {
    const level = getLevel();
    const cfg = LEVEL_LIMITS[level];
    const limit = LEVEL_LIMITS[level].mode === 'passive' ? 5 : LEVEL_LIMITS[level].mode === 'suggestive' ? 8 : 20;

    const rules = await queryTopRules(limit);

    if (rules.length === 0) {
        return getIntro(level) + '暂无编码规则。使用过程中遇到编译错误会自动积累。';
    }

    const lines = [];
    lines.push(getIntro(level));
    lines.push('## 编码硬约束');
    lines.push('');
    lines.push('以下规则来自高频编译错误统计（命中次数越高越需重视）：');
    lines.push('');

    for (let i = 0; i < rules.length; i++) {
        const r = rules[i];
        lines.push(`${i + 1}. **${r.code}** (×${r.count}) — ${r.rules}`);
    }

    if (cfg.styleHint) {
        lines.push('');
        lines.push('## 🎨 编码风格建议');
        lines.push('');
        lines.push('推荐 `lookup_ref(topic="styles")` 查看 5 种代码风格，本项目可根据需求选择：');
        lines.push('· **快速原型** → 极简型（最小代码量，功能优先）');
        lines.push('· **日常开发** → 保守稳健型（Bit#(1), FIFOF, 显式调度）');
        lines.push('· **生产流片** → 工程量产型（BVI import, pipeline checker）');
    }

    if (cfg.collabHint) {
        lines.push('');
        lines.push('## 💬 保持沟通');
        lines.push('');
        lines.push('编码中遇到不确定的 BSV 语法、风格选择、架构决策——随时问我。');
        lines.push('每完成一个模块后建议 `check_style(files)` 检查一下。');
        lines.push('我会陪你把整个项目写完。');
    }

    const hotTopics = await queryHotTopics(5);
    if (hotTopics.length > 0) {
        lines.push('');
        lines.push('## 📊 热点知识');
        lines.push('');
        lines.push('以下参考文档近期被查阅最多（可能跟你的编码需求相关）：');
        lines.push('');
        for (const ht of hotTopics) {
            lines.push(`· \`lookup_ref(topic="${ht.topic}")\` (×${ht.count})`);
        }
    }

    return lines.join('\n');
}
