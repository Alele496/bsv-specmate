#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { checkStyle } from "../src/tools/check_style.mjs";
import { guide } from "../src/tools/specmate_guide.mjs";
import { learn } from "../src/tools/specmate_learn.mjs";
import { getLevel, LEVEL_LIMITS } from "../src/config.mjs";

const server = new McpServer({
    name: "bsv-specmate",
    version: "0.2.0-dev",
});

server.tool(
    "specmate_guide",
    "Specmate 知识引擎入口。调用前告诉 specmate 你的当前阶段和情况。specmate 内部处理所有细节，返回针对性指导。",
    {
        phase: z.enum(["pre_code", "on_error", "continue", "decide"])
            .describe("当前阶段: pre_code(编码前预测) / on_error(编译报错诊断) / continue(下一步指引) / decide(方案选择)"),
        input: z.string().describe("简短描述: 任务目标(pre_code) / 错误码或完整错误(on_error) / 下一步任务(continue) / 待选方案(decide)"),
    },
    async ({ phase, input }) => {
        const result = await guide({ phase, input });
        return { content: [{ type: "text", text: result }] };
    }
);

server.tool(
    "specmate_check",
    "BSV 代码静态检查。写完 .bsv 文件后调用，检测 18 种常见错误 (方法顺序、保留字、Bool 运算符、并行写冲突、字面量溢出等)。",
    {
        files: z.array(z.string()).describe("要检查的 .bsv 文件路径列表"),
    },
    async ({ files }) => {
        const level = getLevel();
        const cfg = LEVEL_LIMITS[level];
        const results = checkStyle({ files });

        if (results.length === 0) {
            const msg = cfg.collabHint
                ? "没有发现问题。写得好。继续的话调 specmate_guide(phase=\"continue\")。"
                : "没有发现问题。";
            return { content: [{ type: "text", text: msg }] };
        }

        const text = results.map(r =>
            `[${r.check}] ${r.file}:${r.line} — ${r.message}\n  建议: ${r.suggestion}`
        ).join("\n\n");

        const parts = [`发现 ${results.length} 个问题:\n\n${text}`];

        if (cfg.crossRef) {
            const hooks = [];
            const checks = [...new Set(results.map(r => r.check))];
            const topicHints = {
                P0032: "module", P0030: "module", P0005: "keywords", T0011: "keywords",
                T0061: "types", T0060: "types", T0051: "types", T0132: "types",
                G0004: "schedule", G0004_FSM: "schedule", G0010: "schedule",
                G0030: "schedule", G0040: "schedule",
                T0004: "stdlib", T0016: "structs", P0073: "module",
                P0085: "attributes", G0054: "attributes", T0080: "module",
                T0144: "unions",
            };
            for (const c of checks) {
                if (topicHints[c]) {
                    hooks.push(`specmate_guide(phase="decide", input="${c} 怎么修")`);
                }
            }
            if (hooks.length > 0) {
                parts.push(`\n💡 不确定怎么修? 调 ${hooks[0]}`);
            }
        }

        if (cfg.collabHint) {
            parts.push("\n💬 修完后可以再检查一次。写下一部分时调 specmate_guide(phase=\"continue\")。");
        }

        return { content: [{ type: "text", text: parts.join("") }] };
    }
);

server.tool(
    "specmate_learn",
    "把新的编译错误加入 specmate 编码记忆。遇到 lookup_error 未收录的错误码时使用。",
    {
        code: z.string().describe("错误码, 如 'P0005' 或 'G0010'"),
        title: z.string().describe("简短标题, 如 'Methods must be at end of block'"),
        bsc_output: z.string().describe("bsc 编译器原始错误输出"),
        cause: z.string().describe("根因分析"),
        solution: z.string().describe("修复方案, 含代码示例"),
        rules: z.string().optional().describe("通用预防规则"),
    },
    async ({ code, title, bsc_output, cause, solution, rules }) => {
        const result = await learn({ code, title, bsc_output, cause, solution, rules: rules || "" });
        return { content: [{ type: "text", text: result }] };
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);
