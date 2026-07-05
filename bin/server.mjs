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
    "Call BEFORE writing any BSV module (phase=pre_code) — like checking the weather before heading out. Returns traps, coding memories, and references for your task. Also call when: compilation fails (phase=on_error), unsure between two approaches (phase=decide), ready for the next module (phase=continue), or need a standard code skeleton (phase=pattern).",
    {
        phase: z.enum(["pre_code", "on_error", "continue", "decide", "pattern"])
            .describe("When you are: pre_code=about to write a module | on_error=compilation failed with error code | continue=writing next module | decide=choosing between two approaches | pattern=need a standard module skeleton"),
        input: z.string().describe("Brief: task description (pre_code) | error code (on_error) | next task (continue) | two options (decide) | what module (pattern)"),
    },
    async ({ phase, input }) => {
        const result = await guide({ phase, input });
        return { content: [{ type: "text", text: result }] };
    }
);

server.tool(
    "specmate_check",
    "ALWAYS call after writing .bsv files, before compiling with bsc. Runs 18 static checks — method order, Bool misuse, keyword conflicts, literal overflow, struct field typos, etc. No bsc needed, results in under a second. Catch errors here to avoid a full compile-fix cycle.",
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
    "Only when specmate_guide(phase=on_error) says an error code is not yet known. Stores it in SQLite so the same pitfall is blocked next time. You write it once, specmate remembers forever.",
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
