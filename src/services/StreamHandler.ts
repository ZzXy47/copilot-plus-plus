/**
 * StreamHandler — SSE 流处理
 * 解析 API 流式响应，转换为 VS Code LanguageModelResponsePart
 *
 * 参考 DeepSeek V4 / LLM Gateway 实现：
 * - 工具调用按 index 增量累积，finish 时统一发送
 * - reasoning_content → ThinkingPart（运行时检测，fallback TextPart）
 */

import * as vscode from 'vscode';
import type { ChatCompletionRequest } from '../api/types';
import { DuoYuanXApiClient } from '../api/DuoYuanXApiClient';
import { parseSSEStream } from '../utils/sseParser';
import { DuoYuanXError, DuoYuanXErrorCode } from '../api/errors';
import { logger } from '../utils/logger';

export interface StreamResult {
  contentLength: number;
  reasoningLength: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

/** Copilot Chat 用量上报 MIME 类型（固定值，不可修改） */
const USAGE_MIME = 'usage';

export class StreamHandler {
  constructor(
    private readonly apiClient: DuoYuanXApiClient,
  ) {}

  /**
   * 处理流式响应，将 SSE chunk 转为 VS Code Part 上报
   */
  async handle(
    body: ChatCompletionRequest,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
    modelId: string,
  ): Promise<StreamResult> {
    const resp = await this.apiClient.streamChat(body);

    if (!resp.body) {
      throw new DuoYuanXError(DuoYuanXErrorCode.BAD_RESPONSE, '空响应体');
    }

    let contentLength = 0;
    let reasoningLength = 0;
    let totalTokens = 0;
    let promptTokens = 0;
    let completionTokens = 0;

    // GLM 系列标识（需 XML 过滤）
    const isGlm = modelId.startsWith('glm-');

    // 工具调用增量累积（按 index）
    const pendingToolCalls = new Map<number, {
      id: string;
      name: string;
      arguments: string;
    }>();

    const flushToolCalls = () => {
      for (const tc of pendingToolCalls.values()) {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.arguments || '{}'); } catch { /* keep empty */ }
        progress.report(new vscode.LanguageModelToolCallPart(
          tc.id || `${tc.name}-${Date.now()}`,
          tc.name,
          input,
        ));
        logger.info(`Tool call: ${tc.name}`, input);
      }
      pendingToolCalls.clear();
    };

    const stream = parseSSEStream(resp.body);

    for await (const chunk of stream) {
      if (token.isCancellationRequested) break;

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;

      // 1) 思维链 → ThinkingPart（参考 DeepSeek V4 / MiMo）
      if (delta.reasoning_content) {
        reasoningLength += delta.reasoning_content.length;
        progress.report(createThinkingPart(delta.reasoning_content));
      }

      // 2) 文本内容（GLM 系列过滤 <think>/<tool_call> XML）
      if (delta.content) {
        if (isGlm) {
          let text = delta.content;
          // GLM: 剥离 <think>...</think> 用于思考内容
          let m: RegExpExecArray | null;
          const THINK_RE = /<think>([\s\S]*?)<\/think>/g;
          while ((m = THINK_RE.exec(text)) !== null) {
            if (m[1]) { reasoningLength += m[1].length; progress.report(createThinkingPart(m[1]!)); }
          }
          text = text.replace(THINK_RE, '');
          // GLM: 剥离 XML 工具调用 <tool_call>...</tool_call>
          text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');
          text = text.replace(/<arg_key>[\s\S]*?<\/arg_key>/g, '');
          text = text.replace(/<\/?(think|tool_call|arg_key|arg_value)>/g, '');
          if (text.trim().length > 0) {
            contentLength += text.length;
            progress.report(new vscode.LanguageModelTextPart(text));
          }
        } else {
          contentLength += delta.content.length;
          progress.report(new vscode.LanguageModelTextPart(delta.content));
        }
      }

      // 3) 工具调用增量 → 累积（不继续，允许同 chunk 中 content + tool_calls 共存）
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          let pending = pendingToolCalls.get(tc.index);
          if (!pending) {
            pending = { id: tc.id ?? '', name: '', arguments: '' };
            pendingToolCalls.set(tc.index, pending);
          }
          if (tc.id) pending.id = tc.id;
          if (tc.function?.name) pending.name += tc.function.name;
          if (tc.function?.arguments) pending.arguments += tc.function.arguments;
        }
      }

      // 4) finish_reason 时冲刷工具调用
      if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
        flushToolCalls();
      }

      // 5) 收集 usage — 收到即上报
      if (chunk.usage) {
        totalTokens = chunk.usage.total_tokens;
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;

        try {
          const usagePayload = {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
          };
          progress.report(
            new vscode.LanguageModelDataPart(
              new TextEncoder().encode(JSON.stringify(usagePayload)),
              USAGE_MIME,
            ),
          );
        } catch { /* ignore */ }
      }
    }

    // 流结束，冲刷剩余工具调用
    flushToolCalls();

    logger.info(
      `Chat 完成: model=${modelId}, tokens=${totalTokens} (${promptTokens}+${completionTokens}), ` +
      `content=${contentLength}, reasoning=${reasoningLength}`
    );

    return { contentLength, reasoningLength, totalTokens, promptTokens, completionTokens };
  }
}

// ── 静态工具函数 ──

/**
 * 检查 LanguageModelThinkingPart 是否在运行时可用（proposed API）
 */
function isThinkingPartAvailable(): boolean {
  return typeof (vscode as any).LanguageModelThinkingPart === 'function';
}

/**
 * 创建思考内容 Part（自动选择 ThinkingPart 或 TextPart fallback）
 */
export function createThinkingPart(text: string): vscode.LanguageModelTextPart | any {
  if (isThinkingPartAvailable()) {
    return new (vscode as any).LanguageModelThinkingPart(text);
  }
  return new vscode.LanguageModelTextPart(`💭 ${text}`);
}
