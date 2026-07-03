export function suggest(args) {
    const context = (args.context || '').toLowerCase();

    if (!context || context.length < 3) {
        return '用法: suggest(context="描述你遇到的问题或不确定的知识点")';
    }

    const hints = [];

    if (/g0004|并行|双写|conflict.*parallel|write.*conflict/i.test(context)) {
        hints.push('→ `lookup_ref(topic="schedule")` 查看规则调度注解和 Top 集成最佳实践');
        hints.push('→ `lookup_error("G0004")` 查已知 G0004 修复方案');
    }
    if (/g0010|urgency|方法调用冲突|descending_urgency|warning.*urgent/i.test(context)) {
        hints.push('→ `lookup_ref(topic="schedule")` 查看 descending_urgency + mutually_exclusive 用法');
        hints.push('→ `lookup_error("G0010")` 查已知 G0010 修复方案');
    }
    if (/p0005|保留字|keyword|identifier|命名.*错误|unexpected.*keyword/i.test(context)) {
        hints.push('→ `lookup_ref(topic="keywords")` 查看 BSV 关键字和 SV 保留字黑名单');
        hints.push('→ `lookup_error("P0005")` 查已知命名冲突修复方案');
    }
    if (/t0061|bool.*bit|位操作|逻辑操作|~.*bool|bit.*操作符/i.test(context)) {
        hints.push('→ `lookup_ref(topic="types")` 查看 Bool vs Bit#(1) 类型系统');
        hints.push('→ `lookup_error("T0061")` 查 Bool/Bit 类型混淆修复');
    }
    if (/t0060|位宽|bit.*size|拼接|{.*}.*位宽/i.test(context)) {
        hints.push('→ `lookup_ref(topic="types")` 查看 Bit 位宽和拼接规则');
        hints.push('→ `lookup_error("T0060")` 查已知位宽不匹配修复');
    }
    if (/p0030|p0032|method.*语法|value.*method|method.*before.*rule/i.test(context)) {
        hints.push('→ `lookup_ref(topic="module")` 查看标准模块/方法语法');
        hints.push('→ `lookup_error("P0030")` 查 value method 语法修复');
    }
    if (/fifof|fifo|缓冲|标准库|mkfifo|reg.*语法|mkreg|mkdreg/i.test(context)) {
        hints.push('→ `lookup_ref(topic="stdlib")` 查看 FIFO/FIFOF/Reg/Vector 标准库速查');
        hints.push(`→ \`lookup_example(keyword="${context.replace(/"/g,'')}")\` 搜索官方用例`);
    }
    if (/调度|注解|annotation|conflict_free|mutually_exclusive|preempts/i.test(context)) {
        hints.push('→ `lookup_ref(topic="schedule")` 查看调度注解详解');
    }
    if (/tutorial|教程|怎么|如何|不确定|不知道.*语法|概念/i.test(context)) {
        hints.push('→ `lookup_ref(topic="tutorial")` 查看中文 BSV 教程章节索引');
    }
    if (/集成|top|顶层|connect|多模块.*连接|例子|例如|例程/i.test(context)) {
        hints.push('→ `lookup_example(keyword="mkTop")` 搜索 Top 集成示例');
        hints.push('→ `lookup_ref(topic="schedule")` 查看 Top 集成调度最佳实践');
    }

    if (hints.length === 0) {
        hints.push('→ `lookup_ref(topic="tutorial")` 查看中文 BSV 教程');
        hints.push('→ `lookup_example(keyword="${context}")` 在 4,570 个官方用例中搜索');
        hints.push('→ `lookup_error 列出所有已知错误');
    }

    return hints.join('\n');
}
