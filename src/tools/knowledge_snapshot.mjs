/**
 * knowledge_snapshot.mjs — 离线知识快照生成器
 *
 * 用途：导出 specmate 的核心知识为纯文本文件，在 MCP 服务器不可用时
 * （如安全分类器/网络故障）仍能通过文件读取获取关键陷阱和错误信息。
 *
 * 用法：
 *   node src/tools/knowledge_snapshot.mjs [output-path]
 *   默认输出到 dist/specmate-knowledge.md
 *
 * 快照内容：
 *   1. 通用陷阱层（UNIVERSAL_TRAPS）— 所有 BSV 任务都要遵守的硬约束
 *   2. 高频编译错误速查表 — 错误码 + 一句话原因 + 修复
 *   3. 关键范式模式 — findIndex 骨架、encoder 模式等
 *   4. BSV 2025.07 特殊规则 — vec() 已废、function 关键字冲突等
 *
 * 这个文件设计为可以被直接嵌入 agent prompt，或在 bench 实验中
 * 作为 specmate 知识的"静态后备"。
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { UNIVERSAL_TRAPS, GRAPH, KEYWORDS } from './_matcher.mjs';
import { getAllPatterns } from './_patterns.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function summarizeRule(code) {
    const rules = {
        'P0005': 'function 是 V2K 保留字 — 模块内不可用。genWith/map 回调用 \\== (1) 部分应用或独立包中的具名函数。',
        'P0030': 'Value method 用 = expr 或 ? : 三元链，不能用 if-return。function 内 for/if 中不可 return——用 flag + 末尾 return。',
        'P0032': '所有 module/rule 必须在所有 method 之前。',
        'G0004': '同一 rule 内每个寄存器只能被写入一次，检查 case default 分支。',
        'G0005': '加 (* no_implicit_conditions *) 确保 if/case 完备性检查。',
        'G0010': '跨 rule 数据用 FIFOF 传，跨模块互斥加 urgency 标注。',
        'G0053': '寄存器初始化只能用字面量，模块参数不在此列——改用 mkRegU。',
        'T0043': '(* synthesize *) 模块的参数必须是 Bits 类具体类型（Bit#(n)/UInt#(n)），不能用 Integer。',
        'T0060': '{...} 拼接总位宽 = 目标寄存器位宽，逐一核对。',
        'T0061': 'Bool 用 !/&&/||，Bit#(n) 用 ~/&/|。接口方法返回值用 Bit#(1) 不用 Bool。',
        'T0051': '扩大寄存器位宽时，所有相关寄存器同步扩宽。',
        'T0004': 'Vector 构造用 genWith(fromInteger) 而非 vec()（vec() 在 BSC 2025.07 已移除）。',
        'T0011': '寄存器名不要和方法名重名，寄存器加后缀 _reg 或 _r。',
        'T0132': 'sized literal 值不超位宽。',
        'P0073': '类型参数/接口方法/函数参数不能重名。',
        'P0085': 'synthesize 不拼写成 synthesized，属性不重复。',
        'G0030': 'descending_urgency 不循环。',
        'G0054': 'urgency 引用的规则必须在当前模块中存在。',
    };
    return rules[code] || '见 lookup_error 详情。';
}

function generate() {
    const lines = [];

    lines.push('# specmate 知识快照');
    lines.push('');
    lines.push('> 自动生成于 ' + new Date().toISOString().split('T')[0]);
    lines.push('> 此文件是 specmate MCP 服务器的静态知识导出。在 MCP 不可用时，');
    lines.push('> 可直接读取此文件获取关键 BSV 编码陷阱和错误信息。');
    lines.push('');
    lines.push('---');
    lines.push('');

    // 1. Universal traps — always critical
    lines.push('## 通用陷阱（所有 BSV 任务必须遵守）');
    lines.push('');
    for (const t of UNIVERSAL_TRAPS) {
        const icon = t.severity === 'hard' ? 'HARD' : 'QUALITY';
        lines.push(`- **[${icon}]** ${t.text}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    // 2. Error code quick reference
    lines.push('## 高频编译错误速查');
    lines.push('');
    lines.push('| 错误码 | 一句话原因 | 修复方向 |');
    lines.push('|--------|-----------|---------|');
    const errorCodes = new Set();
    for (const kw of KEYWORDS) {
        for (const e of (GRAPH[kw].errors || [])) errorCodes.add(e);
    }
    for (const code of [...errorCodes].sort()) {
        const summary = summarizeRule(code);
        // Truncate to keep table compact
        const short = summary.length > 60 ? summary.substring(0, 57) + '...' : summary;
        lines.push(`| ${code} | ${short} | |`);
    }
    lines.push('');
    lines.push('> 完整详情用 `specmate_guide(phase="on_error", input="错误码")` 查询。');
    lines.push('');
    lines.push('---');
    lines.push('');

    // 3. Per-domain trap summary
    lines.push('## 领域陷阱速查');
    lines.push('');
    for (const kw of KEYWORDS.sort()) {
        const node = GRAPH[kw];
        const errors = (node.errors || []).join(', ') || '(无)';
        const trapCount = (node.traps || []).length;
        lines.push(`### ${kw} (${node.errors.length} 错误码, ${trapCount} 陷阱)`);
        lines.push(`- **相关错误码**: ${errors}`);
        if (node.traps && node.traps.length > 0) {
            for (const t of node.traps) {
                const icon = t.severity === 'hard' ? 'HARD' : t.severity === 'quality' ? 'QUALITY' : 'STYLE';
                lines.push(`  - [${icon}] ${t.text}`);
            }
        }
        lines.push('');
    }

    lines.push('---');
    lines.push('');

    // 4. BSV 2025.07 special rules
    lines.push('## BSC 2025.07 特殊规则');
    lines.push('');
    lines.push('### vec() 已废弃 (T0004)');
    lines.push('');
    lines.push('**错误**: `vec(0, 1, 2)`');
    lines.push('**正确**: `genWith(fromInteger)` 或 `Vector#(3, Integer)` + 逐位赋值');
    lines.push('');
    lines.push('### function 关键字冲突 (P0005)');
    lines.push('');
    lines.push('BSC 2025.07 使用 Verilog-2001 (V2K) 模式，`function` 是保留字。');
    lines.push('');
    lines.push('**错误**:');
    lines.push('```bsv');
    lines.push('genWith(function(Integer i); return requests[i]; endfunction)');
    lines.push('```');
    lines.push('');
    lines.push('**正确 — 部分应用**:');
    lines.push('```bsv');
    lines.push('genWith(requests, \\== (1))  // requests[1], requests[2], ...');
    lines.push('```');
    lines.push('');
    lines.push('**正确 — 提取独立 function**:');
    lines.push('```bsv');
    lines.push('// 在模块外定义');
    lines.push('function Bool checkRequest(Integer i);');
    lines.push('  return requests[i] == 1;');
    lines.push('endfunction');
    lines.push('// 在模块内引用');
    lines.push('findIndex(checkRequest, vec)');
    lines.push('```');
    lines.push('');
    lines.push('### \\== 部分应用语法');
    lines.push('');
    lines.push('- `\\== (1)`: 检查每个元素是否等于 1');
    lines.push('- `\\== elem`: 检查每个元素是否等于变量 elem');
    lines.push('- 等价于 `function(x); return x == 1; endfunction` 但在 BSC 2025.07 中合法');
    lines.push('');
    lines.push('---');
    lines.push('');

    // 5. Key patterns
    const allPatterns = getAllPatterns();
    if (allPatterns.length > 0) {
        lines.push('## 关键代码范式');
        lines.push('');
        for (const p of allPatterns) {
            lines.push(`### ${p.name}`);
            lines.push('');
            lines.push('```bsv');
            lines.push(p.skeleton);
            lines.push('```');
            lines.push('');
            if (p.traps && p.traps.length > 0) {
                lines.push('**陷阱**:');
                for (const t of p.traps) {
                    lines.push(`- ${t}`);
                }
                lines.push('');
            }
        }
    }

    return lines.join('\n');
}

// Main
const outputPath = process.argv[2] || resolve(PROJECT_ROOT, 'dist', 'specmate-knowledge.md');
const dir = dirname(outputPath);
mkdirSync(dir, { recursive: true });
writeFileSync(outputPath, generate(), 'utf-8');
console.log(`[specmate] Knowledge snapshot written to: ${outputPath}`);
