#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { checkStyle } from "../src/tools/check_style.mjs";
import { guide } from "../src/tools/specmate_guide.mjs";
import { learn } from "../src/tools/specmate_learn.mjs";
import { getLevel, LEVEL_LIMITS } from "../src/config.mjs";
import { hitError, addCapture, getLatestCaptureByCode, resolveCaptureById } from "../src/db/query.mjs";

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
    "Run static checks on .bsv files. By default runs 3 high-precision checks (literal overflow, zero-width literal, Bool misuse). Set full=true to run all checks including regex-based ones.",
    {
        files: z.array(z.string()).describe("要检查的 .bsv 文件路径列表"),
        full: z.boolean().optional().default(false).describe("设为 true 运行全部检查（含正则类，误报率较高）。默认只运行 3 项高精度检查。"),
    },
    async ({ files, full }) => {
        const level = getLevel();
        const cfg = LEVEL_LIMITS[level];
        const results = checkStyle({ files, full });

        // Auto-count: every check_style hit increments the error's count
        [...new Set(results.map(r => r.check))].forEach(c => hitError(c).catch(() => {}));

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

server.tool(
    "specmate_capture",
    "Feed raw bsc compiler output. specmate auto-parses error codes and saves context for project memory. Use when compilation produces errors — no need to manually call specmate_learn, just capture first.",
    {
        bsc_output: z.string().describe("bsc 编译器的完整输出 (stdout+stderr)"),
        files: z.array(z.string()).optional().describe("当前编译相关的 .bsv 文件路径"),
    },
    async ({ bsc_output, files }) => {
        // Parse all error codes from bsc output
        const codePattern = /\b([GPTBS]\d{4})\b/g;
        const codes = [...new Set([...bsc_output.matchAll(codePattern)].map(m => m[1]))];

        if (codes.length === 0) {
            // Try to find error-like patterns even without standard codes
            const hasError = /error|warning/i.test(bsc_output);
            if (hasError) {
                await addCapture({ code: "UNKNOWN", bsc_output, files: files?.join(", ") }).catch(() => {});
                return { content: [{ type: "text", text: "未识别出标准错误码，已以 UNKNOWN 暂存。如果是新错误类型，用 specmate_learn 手动录入。" }] };
            }
            return { content: [{ type: "text", text: "未在输出中检测到编译错误码。" }] };
        }

        // Fire-and-forget capture for each unique error code
        for (const code of codes) {
            addCapture({ code, bsc_output, files: files?.join(", ") }).catch(() => {});
        }

        const list = codes.map(c => `  • ${c}`).join('\n');
        const unresolvedMsg = codes.length === 1
            ? `错误码 ${codes[0]} 已记录。修好后调 specmate_resolve(code="${codes[0]}", cause="...", solution="...") 保存经验。`
            : `共 ${codes.length} 个错误码已记录:\n${list}\n\n修好后逐条调 specmate_resolve 保存修复经验。`;

        return { content: [{ type: "text", text: unresolvedMsg }] };
    }
);

server.tool(
    "specmate_resolve",
    "Call AFTER you fix a compilation error. Records the cause and solution, linking to the most recent capture. This is how specmate learns from your fixes — the project memory grows with every resolve.",
    {
        code: z.string().describe("错误码, 如 'G0004'"),
        cause: z.string().describe("根因: 为什么会出现这个错误"),
        solution: z.string().describe("修复方案: 怎么改的, 改了什么"),
    },
    async ({ code, cause, solution }) => {
        const capture = await getLatestCaptureByCode(code);
        if (!capture) {
            return { content: [{ type: "text", text: `没有找到 ${code} 的未解决记录。可能已经被 resolve 过了。` }] };
        }
        await resolveCaptureById(capture.id, { cause, solution });
        return { content: [{ type: "text", text: `✅ ${code} 已标记为已解决。原因和方案已记录。` }] };
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);
