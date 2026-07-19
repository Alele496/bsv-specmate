/**
 * MCP Elicitation — 阶段感知增强模块
 *
 * ## 调研结论（Q3 方向 1，子任务 1.1）
 *
 * MCP SDK 1.29.0（当前安装版本）完整支持 Elicitation 协议：
 *
 *   API: mcpServer.server.elicitInput(params)
 *   - 参数: { mode: 'form', message: string, requestedSchema: object }
 *   - 返回: { action: 'accept'|'decline'|'cancel', content?: object }
 *   - 调用位置: 必须在 tool handler 内部调用（阻塞式，等待客户端回复）
 *
 * 传输层兼容性：
 *   - HTTP/SSE (StreamableHTTPServerTransport): 完整支持，参考 SDK 示例 elicitationFormExample.js
 *   - stdio (StdioServerTransport): 依赖客户端实现。协议层面支持同步 request-response 模式
 *     的 ElicitRequest/ElicitResult，但 Claude Code 是否解析并展示 form schema 需实测确认
 *
 * 设计决策：
 *   - 优先尝试 elicitation；客户端不支持时静默回退到 inferPhase() 关键词推断
 *   - form 模式使用 JSON Schema 定义单选项（oneOf），Agent 单次回复完成阶段选择
 *   - 不对 stdio vs HTTP 做区分——调 elicitation，失败则 fallback
 */

import { getLevel } from '../config.mjs';
import { inferPhase } from '../tools/_matcher.mjs';

// ─── Elicitation trigger strategy (子任务 1.2) ───────────────────────────────

/**
 * 三级模式的 elicitation 触发决策表
 *
 * | SPECMATE_LEVEL | 模式      | pre_code 入口 | on_error 后 | check 后 | 模块集成前 |
 * |---------------|-----------|--------------|-------------|----------|-----------|
 * | verify        | passive   | 0 次         | 0 次        | 0 次      | 0 次      |
 * | develop       | suggestive| 1 次(首次)    | 0 次        | 0 次      | 0 次      |
 * | tapeout       | collaborative| 1 次      | 1 次        | 1 次      | 1 次      |
 *
 * develop 模式：只在首次 pre_code/scan 时询问一次，同一 session 不再重复。
 * tapeout 模式：每个关键节点都需要确认阶段，确保流程节点不遗漏。
 * verify 模式：纯被动，完全不询问——Agent 自己决定什么时候用 specmate。
 */
export const ELICIT_TRIGGERS = {
    verify: {
        preCode: false,
        onError: false,
        afterCheck: false,
        beforeIntegration: false,
    },
    develop: {
        preCode: true,
        onError: false,
        afterCheck: false,
        beforeIntegration: false,
    },
    tapeout: {
        preCode: true,
        onError: true,
        afterCheck: true,
        beforeIntegration: true,
    },
};

/**
 * 判断当前 SPECMATE_LEVEL 下是否应触发 elicitation
 * @param {'preCode'|'onError'|'afterCheck'|'beforeIntegration'} triggerPoint
 * @param {boolean} alreadyElicited — 同一 session 内是否已经询问过（develop 模式只问一次）
 * @returns {boolean}
 */
export function shouldElicit(triggerPoint, alreadyElicited = false) {
    const level = getLevel();
    const triggers = ELICIT_TRIGGERS[level];
    if (!triggers || !triggers[triggerPoint]) return false;

    // develop 模式：首次 preCode 时询问，后续不再重复
    if (level === 'develop' && alreadyElicited) return false;

    return true;
}

// ─── Message templates (子任务 1.3) ──────────────────────────────────────────

/**
 * 阶段选择 elicitation form schema
 *
 * 设计原则：
 *   - 3 个清晰选项，Agent 单次回复即可完成选择
 *   - 每个选项附带典型场景描述，减少歧义
 *   - JSON Schema oneOf 确保客户端渲染为单选按钮组
 */
export const PHASE_FORM_SCHEMA = {
    type: 'object',
    properties: {
        phase: {
            type: 'string',
            title: '当前设计阶段',
            description: '请选择你当前的工作阶段，specmate 将据此提供对应的陷阱提醒和检查策略。',
            oneOf: [
                {
                    const: 'design',
                    title: 'A) 架构设计',
                    description: '选模块、定接口、规划时钟/复位方案、FIFO 选型、互联拓扑'
                },
                {
                    const: 'code',
                    title: 'B) 编码实现',
                    description: '写 rule/method、定义类型、处理位宽和语法细节'
                },
                {
                    const: 'debug',
                    title: 'C) 编译调试',
                    description: '正在修复 BSC 编译错误、运行仿真验证逻辑'
                }
            ],
            default: 'code'
        }
    },
    required: ['phase']
};

/** @type {string} */
export const PHASE_FORM_MESSAGE = 'specmate 需要了解你的当前阶段，以便提供针对性的 BSV 编码支持。';

/**
 * 调用 MCP Elicitation 询问 Agent 当前设计阶段
 *
 * @param {object} mcpServer — McpServer 实例（用于访问 .server.elicitInput）
 * @returns {Promise<'design'|'code'|'debug'|null>} — 返回 Agent 选择的阶段，不支持时返回 null
 */
export async function elicitPhase(mcpServer) {
    try {
        const result = await mcpServer.server.elicitInput({
            mode: 'form',
            message: PHASE_FORM_MESSAGE,
            requestedSchema: PHASE_FORM_SCHEMA,
        });

        if (result.action === 'accept' && result.content && result.content.phase) {
            return result.content.phase;
        }

        // Agent declined or cancelled — fall back to inferPhase
        return null;
    } catch (_err) {
        // Elicitation not supported by client/transport — silent fallback
        return null;
    }
}

// ─── Phase resolution — elicitation first, inferPhase fallback (子任务 1.5) ───

/**
 * 解析 Agent 当前设计阶段：优先使用 MCP elicitation，失败则回退到 inferPhase() 关键词推断。
 *
 * 调用流程：
 *   1. 检查 session 缓存 → 如果有缓存，直接返回（develop 模式只问一次）
 *   2. 检查应否触发 elicitation（根据 SPECMATE_LEVEL + triggerPoint）
 *   3. 触发 → 尝试 elicitInput() → 成功则缓存并返回
 *   4. 失败/跳过 → 调用 inferPhase(input) 关键词推断 → 返回
 *
 * @param {string} input - 任务描述（用于 inferPhase 关键词匹配）
 * @param {object} mcpServer - McpServer 实例
 * @param {'preCode'|'onError'|'afterCheck'|'beforeIntegration'} triggerPoint - 触发点
 * @param {object} options
 * @param {Promise<'design'|'code'|'debug'|null>} options.getCachedPhase - 获取缓存的 session phase
 * @param {Function} options.cachePhase - 缓存 phase 到 session
 * @returns {Promise<'design'|'code'|'debug'>}
 */
export async function resolvePhase(input, mcpServer, triggerPoint, { getCachedPhase, cachePhase } = {}) {
    // 1. Check session cache — if phase was already determined this session, reuse it
    if (getCachedPhase) {
        try {
            const cached = await getCachedPhase();
            if (cached) return cached;
        } catch (_) { /* proceed to elicitation */ }
    }

    // 2. Check if elicitation should trigger
    const hasElicited = false; // We already checked cache above — if we reach here, we haven't elicited
    if (shouldElicit(triggerPoint, hasElicited)) {
        const elicited = await elicitPhase(mcpServer);
        if (elicited) {
            // Cache the result for this session
            if (cachePhase) {
                try { await cachePhase(elicited); } catch (_) { /* non-critical */ }
            }
            return elicited;
        }
    }

    // 3. Fallback: keyword-based inference
    const inferred = inferPhase(input);

    // Cache even inferred phases (so develop mode doesn't re-ask via elicitation)
    if (cachePhase) {
        try { await cachePhase(inferred); } catch (_) { /* non-critical */ }
    }

    return inferred;
}
