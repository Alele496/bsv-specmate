#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { checkStyle } from "../src/tools/check_style.mjs";
import { lookupError } from "../src/tools/lookup_error.mjs";
import { lookupRef } from "../src/tools/lookup_ref.mjs";
import { VALID_TOPICS } from "../src/tools/lookup_ref.mjs";
import { lookupExample } from "../src/tools/lookup_example.mjs";
import { addError } from "../src/tools/add_error.mjs";
import { preflight } from "../src/tools/preflight.mjs";
import { codingRules } from "../src/tools/coding_rules.mjs";
import { suggest } from "../src/tools/suggest.mjs";
import { getLevel, LEVEL_LIMITS } from "../src/config.mjs";

const server = new McpServer({
    name: "bsv-specmate",
    version: "0.1.0",
});

server.tool(
    "check_style",
    "Pre-compilation static check for BSV files. Checks for common errors like method ordering, Bool operators, reserved keywords, and duplicate register writes.",
    {
        files: z.array(z.string()).describe("Paths to .bsv files to check"),
    },
    async ({ files }) => {
        const level = getLevel();
        const cfg = LEVEL_LIMITS[level];
        const results = checkStyle({ files });
        if (results.length === 0) {
            const msg = cfg.collabHint ? "No issues found. 有需要我进一步检查的随时说。" : "No issues found.";
            return { content: [{ type: "text", text: msg }] };
        }
        const text = results.map(r =>
            `[${r.check}] ${r.file}:${r.line} — ${r.message}\n  建议: ${r.suggestion}`
        ).join("\n\n");

        let hint = '';
        if (cfg.crossRef) {
            const checks = [...new Set(results.map(r => r.check))];
            if (checks.includes('P0032') || checks.includes('P0030')) {
                hint += '\n💡 `lookup_ref(topic="module")` 查看正确的模块/method 语法。';
            }
            if (checks.includes('P0005') || checks.includes('T0011')) {
                hint += '\n💡 `lookup_ref(topic="keywords")` 查看 BSV 关键字和 SV 保留字列表。';
            }
            if (checks.includes('T0061') || checks.includes('T0060')) {
                hint += '\n💡 `lookup_ref(topic="types")` 查看 Bit/Bool 类型系统和位宽规则。';
            }
            if (checks.includes('G0004') || checks.includes('G0004_FSM') || checks.includes('G0010')) {
                hint += '\n💡 `lookup_ref(topic="schedule")` 查看规则调度标注和 G0004 修复方案。';
            }
            if (checks.includes('T0004')) {
                hint += '\n💡 `lookup_ref(topic="stdlib")` 查看 Vector 和 genWith 标准用法。';
            }
            if (cfg.collabHint) {
                hint += '\n\n💬 修完后我可以再查一遍。不确定怎么修的话，把具体问题描述给我。';
            }
        }

        return { content: [{ type: "text", text: `Found ${results.length} issue(s):\n\n${text}${hint}` }] };
    }
);

server.tool(
    "lookup_error",
    "Look up a BSV compilation error by code. Returns the cause, solution, and reference. Call without arguments to list all known errors.",
    {
        code: z.string().optional().describe("Error code like P0005 or T0061. Omit to list all errors."),
    },
    async ({ code }) => {
        const result = await lookupError({ code: code || "" });
        return {
            content: [{ type: "text", text: result }],
        };
    }
);

server.tool(
    "lookup_ref",
    "Look up BSV language reference documentation.",
    {
        topic: z.enum(VALID_TOPICS).describe("Reference topic"),
    },
    async ({ topic }) => {
        const result = lookupRef({ topic });
        return {
            content: [{ type: "text", text: result }],
        };
    }
);

server.tool(
    "lookup_example",
    "Search the BSC test suite (4,570 official .bsv files) for usage examples by keyword.",
    {
        keyword: z.string().describe("Keyword to search for, e.g. 'FIFO bypass' or 'descending_urgency'"),
        directory: z.string().optional().describe("Subdirectory to limit search, e.g. 'bsc.scheduler'"),
    },
    async ({ keyword, directory }) => {
        const result = lookupExample({ keyword, directory: directory || "" });
        return {
            content: [{ type: "text", text: result }],
        };
    }
);

server.tool(
    "add_error",
    "Add a new compilation error to the knowledge base. Use when lookup_error returns not found.",
    {
        code: z.string().describe("Error code, e.g. 'P0005' or 'G0010'"),
        title: z.string().describe("Short title, e.g. 'Methods must be at end of block'"),
        bsc_output: z.string().describe("Raw compiler error output from bsc"),
        cause: z.string().describe("Root cause analysis of the error"),
        solution: z.string().describe("How to fix the error, with code examples"),
        rules: z.string().optional().describe("General rule to prevent this error"),
    },
    async ({ code, title, bsc_output, cause, solution, rules }) => {
        const result = await addError({ code, title, bsc_output, cause, solution, rules: rules || "" });
        return {
            content: [{ type: "text", text: result }],
        };
    }
);

server.tool(
    "preflight",
    "Call BEFORE writing any BSV code. Returns the most common compilation errors and design warnings to avoid, tailored to SPECMATE_LEVEL (silicon/wafer/tapeout).",
    {},
    async () => {
        const result = await preflight();
        return {
            content: [{ type: "text", text: result }],
        };
    }
);

server.tool(
    "coding_rules",
    "Returns BSV coding constraints derived from high-frequency compilation errors. Call at the start of each new task. Follow these rules silently while coding.",
    {},
    async () => {
        const result = await codingRules();
        return {
            content: [{ type: "text", text: result }],
        };
    }
);

server.tool(
    "suggest",
    "When unsure how to fix an error or what specmate tool to use next, describe your situation. Returns targeted tool suggestions.",
    {
        context: z.string().describe("Describe the error, concept, or situation you need help with"),
    },
    async ({ context }) => {
        const result = suggest({ context });
        return {
            content: [{ type: "text", text: result }],
        };
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);
