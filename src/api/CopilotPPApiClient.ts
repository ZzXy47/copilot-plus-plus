/**
 * CopilotPPApiClient — Copilot++ API HTTP 客户端
 * 封装 fetch + SSE 流式通信
 */

import type {
  ApiModelsResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
} from './types';
import { CopilotPPError, CopilotPPErrorCode, extractErrorFromResponse, wrapError } from './errors';
import { logger } from '../utils/logger';

export class CopilotPPApiClient {
  constructor(
    private readonly getBaseUrl: () => string,
    private readonly getApiKey: () => Promise<string | undefined>,
    private readonly timeout: number = 120000,
  ) {}

  // ─── 通用请求方法 ───

  private async getHeaders(): Promise<Record<string, string>> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new CopilotPPError(CopilotPPErrorCode.INVALID_API_KEY, 'API Key 未设置');
    }
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const headers = await this.getHeaders();
      const url = `${this.getBaseUrl()}${path}`;
      logger.debug(`请求: ${method} ${url}`);
      const resp = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw await extractErrorFromResponse(resp);
      }

      return (await resp.json()) as T;
    } catch (err) {
      if (err instanceof CopilotPPError) throw err;
      throw wrapError(err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─── 模型列表 ───

  async listModels(): Promise<ApiModelsResponse> {
    logger.debug('获取模型列表...');
    return this.request<ApiModelsResponse>('GET', '/v1/models');
  }

  // ─── 流式聊天 ───

  async streamChat(
    body: ChatCompletionRequest,
    signal?: AbortSignal,
  ): Promise<Response> {
    logger.debug(`流式聊天: model=${body.model}`);

    const requestBody = { ...body, stream: true };

    // 记录请求体用于调试（不含敏感信息）
    logger.debug('请求体:', JSON.stringify({
      model: requestBody.model,
      messages_count: requestBody.messages.length,
      max_tokens: requestBody.max_tokens,
      temperature: requestBody.temperature,
      top_p: requestBody.top_p,
      reasoning: requestBody.reasoning,
      thinking: requestBody.thinking,
      thinkingConfig: requestBody.thinkingConfig,
      enable_thinking: requestBody.enable_thinking,
      disable_thinking: requestBody.disable_thinking,
      extra_body: requestBody.extra_body,
    }));

    const headers = await this.getHeaders();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const requestBody = {
        ...body,
        stream: true,
        stream_options: { include_usage: true },
      };
      const resp = await fetch(`${this.getBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw await extractErrorFromResponse(resp);
      }

      if (!resp.body) {
        throw new CopilotPPError(CopilotPPErrorCode.BAD_RESPONSE, '响应体为空');
      }

      return resp;
    } catch (err) {
      if (err instanceof CopilotPPError) throw err;
      throw wrapError(err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─── 非流式聊天（用于工具调用等场景）──

  async chatCompletion(
    body: ChatCompletionRequest,
    signal?: AbortSignal,
  ): Promise<ChatCompletionResponse> {
    logger.debug(`非流式聊天: model=${body.model}`);
    return this.request<ChatCompletionResponse>(
      'POST',
      '/v1/chat/completions',
      { ...body, stream: false },
      signal,
    );
  }

  // ─── 图像生成 ───

  async generateImage(
    body: ImageGenerationRequest,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResponse> {
    logger.debug(`图像生成: model=${body.model}`);
    return this.request<ImageGenerationResponse>(
      'POST',
      '/v1/images/generations',
      body,
      signal,
    );
  }

  // ─── 健康检查 ───

  async healthCheck(): Promise<boolean> {
    try {
      await this.request<ApiModelsResponse>('GET', '/v1/models');
      return true;
    } catch {
      return false;
    }
  }
}
