import { queryAllErrors } from '../db/query.mjs';
import { getLevel, LEVEL_LIMITS } from '../config.mjs';

const COMMON_WARNINGS = [
    {
        title: '跨 Rule 数据传递',
        detail: '跨 rule 传递触发 + 数据，用 FIFOF 而非 PulseWire + Reg 组合。PulseWire 只存活一个 cycle，搭配 Reg 会导致首个数据丢失。',
        ref: 'G0010',
    },
    {
        title: '跨模块调度标注',
        detail: '外部模块 method 写入寄存器，内部 rule 读取同寄存器 → 需显式加 `(* descending_urgency = "ext_method, int_rule" *)`。',
        ref: 'G0010',
    },
    {
        title: 'Verilog 端口命名',
        detail: 'BSV `method Action` 的端口名 = 参数名（非方法名）。Vivado 连接时需用 `top_wrapper.v` 薄封装对齐端口。',
        ref: 'BSV-PORTS',
    },
    {
        title: 'Interface 导出歧义',
        detail: '多接口模块的 method 导出需避免同名冲突。同名 method 需用 `(* prefix = "" *)` 或拆分子模块。',
        ref: 'P0032',
    },
    {
        title: 'always_ready 判断',
        detail: '无 guard 的 method 会自动推断为 always_ready。若需延迟响应，显式加 guard 条件而非依赖默认行为。',
        ref: null,
    },
    {
        title: 'Clock domain crossing',
        detail: 'BSV 中跨时钟域数据需使用 `mkSyncFIFO` 或 `mkSyncBit05`，直接用普通寄存器会在综合时产生不确定行为。',
        ref: null,
    },
    {
        title: 'Bool 与 Bit 类型切勿混淆',
        detail: '`Bool` 和 `Bit#(1)` 是不同的类型。控制信号如需位拼接或从 Bus 中提取，优先用 `Reg#(Bit#(1))` 而非 `Reg#(Bool)`。Bool 不能用于 `{...}` 拼接，也不能直接用 `bit[0]` 赋值。',
        ref: 'T0061',
    },
    {
        title: 'Vector 构造用 genWith',
        detail: 'BSC 2025.07 标准库不导出 `vec()` 函数。构造 Vector 用 `genWith(fromInteger)` 或显式 `genWith(fn)`。',
        ref: 'T0004',
    },
];

export async function preflight() {
    const level = getLevel();
    const cfg = LEVEL_LIMITS[level];
    const limit = cfg.errors;
    const highlight = cfg.highlight;

    const allErrors = await queryAllErrors();
    const topErrors = allErrors.slice(0, limit);

    const lines = [];

    lines.push(`## 🔴 高频编译错误 (${highlight})`);
    lines.push('');
    lines.push(`当前模式: **${cfg.name}** — 设置 \`SPECMATE_LEVEL=silicon|wafer|tapeout\` 切换干涉强度`);
    lines.push('');

    for (const e of topErrors) {
        lines.push(`### ${e.code} — ${e.title} (×${e.count})`);
        lines.push(`→ ${summarizeRule(e.code)}`);
        lines.push('');
    }

    if (level !== 'silicon') {
        lines.push('---');
        lines.push('');
        lines.push('## ⚠️ 常见设计警告');
        lines.push('');
        const warnCount = level === 'wafer' ? 3 : COMMON_WARNINGS.length;
        for (const w of COMMON_WARNINGS.slice(0, warnCount)) {
            lines.push(`### ${w.title}`);
            lines.push(w.detail);
            if (w.ref) lines.push(`→ 详见: lookup_error("${w.ref}")`);
            lines.push('');
        }
    }

    if (cfg.collabHint) {
        lines.push('---');
        lines.push('');
        lines.push('## 🤝 编码前检查');
        lines.push('');
        lines.push('作为你的编码搭档，我建议开始前做几件事：');
        lines.push('· `lookup_ref(topic="styles")` 根据项目类型选择合适的代码风格');
        lines.push('· 涉及多模块集成时 → `lookup_ref(topic="schedule")` 了解 G0004 修复模式');
        lines.push('· 涉及 FSM 时 → 控制信号用 `Bit#(1)`，枚举类型 case 省略 default');
        lines.push('· 复杂接口对齐时 → `lookup_example(keyword)` 搜官方用例参考');
        lines.push('');
        lines.push('编码过程中遇到任何 BSV 语法不确定性，随时来问。');
    }

    return lines.join('\n');
}

function summarizeRule(code) {
    const rules = {
        'P0032': '所有 module/rule 必须在所有 method 之前。',
        'P0005': '标识符不用 action/bit/byte/reg/wire/module/input/output/priority 等 SV 保留字。',
        'G0004': '同一 rule 内每个寄存器只能被写入一次，检查 case default 分支。',
        'G0010': '跨 rule 数据用 FIFOF 传，跨模块互斥加 urgency 标注。',
        'T0060': '`{...}` 拼接总位宽 = 目标寄存器位宽，逐一核对。',
        'T0061': 'Bool 用 `!`/`&&`/`||`，Bit#(n) 用 `~`/`&`/`|`。控制信号需位拼接时用 `Bit#(1)` 不用 `Bool`。',
        'T0051': '扩大寄存器位宽时，所有相关寄存器同步扩宽。',
        'BSV-PORTS': 'method Action 的 Verilog 端口名 = 参数名，非方法名。',
        'T0004': 'Vector 构造用 `genWith` 而非 `vec()`。',
        'P0030': 'Value method 用 `= expr` 或 `? :` 三元链，不能用 if-return。',
        'T0011': '寄存器名不要和方法名重名，寄存器加后缀 _reg 或 _r。',
    };
    return rules[code] || '见 lookup_error 详情。';
}
