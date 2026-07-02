/**
 * RequestBuilder — 构建 OpenAI 兼容 API 请求体
 * 从 VS Code Chat 请求参数 + copilotpp.models 设置转换为 API 请求
 */

import * as vscode from 'vscode';
import type { ChatCompletionRequest } from '../api/types';
import { ConfigManager } from './ConfigManager';
import { buildThinkingParams, getThinkingState } from './ThinkingMapper';
import { convertMessages } from '../utils/messageConverter';

export class RequestBuilder {
  constructor(
    private readonly configManager: ConfigManager,
  ) {}

  /**
   * 构建完整的 API 请求体
   */
  build(
    modelId: string,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
  ): ChatCompletionRequest {
    const settings = this.configManager.getModelSettings(modelId);
    const apiMessages = convertMessages(messages);

    const body: ChatCompletionRequest = {
      model: modelId,
      messages: apiMessages,
      stream: true,
    };

    const mo = options.modelOptions as Record<string, unknown> | undefined;

    // max_tokens：取 modelOptions 和 settings 的交集最小值
    body.max_tokens = Math.min(
      (mo?.maxOutputTokens as number | undefined) ?? settings.maxOutputTokens,
      settings.maxOutputTokens,
    );

    // temperature — 思考活跃时剥离（disableTemperatureWhenThinking）
    const thinkingState = getThinkingState(
      settings.thinkingType,
      settings.thinkingCanDisable,
      settings.disableTemperatureWhenThinking,
    );

    const isGemini = modelId.startsWith('gemini-');
    if (!isGemini && !thinkingState.disableTemperature) {
      body.temperature = (mo?.temperature as number | undefined) ?? 0.7;
    }

    // Gemini: 限制 max_tokens 避免 Vertex AI 拒绝
    if (isGemini && body.max_tokens && body.max_tokens > 32768) {
      body.max_tokens = 32768;
    }

    // 工具定义
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema as Record<string, unknown>,
        },
      }));
      body.tool_choice = 'auto';
    }

    // 思考参数（ThinkingMapper）
    if (settings.thinkingType && settings.thinkingType !== 'disabled') {
      const thinkingParams = buildThinkingParams(
        settings.thinkingType,
        settings.thinkingEffort,
      );

      Object.assign(body, thinkingParams.topLevel);

      if (Object.keys(thinkingParams.extraBody).length > 0) {
        body.extra_body = { ...(body.extra_body ?? {}), ...thinkingParams.extraBody };
      }
    }

    // settings.json modelOverrides（兼容旧配置）
    const override = this.configManager.getModelOverride(modelId);
    if (override?.temperature !== undefined) body.temperature = override.temperature;
    if (override?.topP !== undefined) body.top_p = override.topP;
    if (override?.maxTokens !== undefined) body.max_tokens = override.maxTokens;
    if (override?.stream !== undefined) body.stream = override.stream;

    return body;
  }
}
