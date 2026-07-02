/**
 * DuoYuanXChatProvider — VS Code LanguageModelChatProvider 实现
 * 将任意 OpenAI 兼容 API 接入 VS Code Copilot Chat
 */

import * as vscode from 'vscode';
import { ConfigManager } from '../services/ConfigManager';
import { ModelManager } from '../services/ModelManager';
import { StatusBarManager } from '../services/StatusBarManager';
import { RequestBuilder } from '../services/RequestBuilder';
import { StreamHandler } from '../services/StreamHandler';
import { DuoYuanXApiClient } from '../api/DuoYuanXApiClient';
import type { DuoYuanXModelInfo } from '../models/ModelInfo';
import { estimateMessagesTokens, updateCharsPerToken, DEFAULT_CHARS_PER_TOKEN } from '../utils/tokenEstimator';
import { DuoYuanXError, DuoYuanXErrorCode, ERROR_MESSAGES } from '../api/errors';
import { logger } from '../utils/logger';

export class DuoYuanXChatProvider implements vscode.LanguageModelChatProvider<DuoYuanXModelInfo> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this._onDidChange.event;
  private isActive = true;
  private charsPerToken = DEFAULT_CHARS_PER_TOKEN;

  constructor(
    private readonly configManager: ConfigManager,
    private readonly modelManager: ModelManager,
    private readonly requestBuilder: RequestBuilder,
    private readonly streamHandler: StreamHandler,
    private readonly statusBar?: StatusBarManager,
  ) {}

  // ─── 生命周期 ───

  refreshModelPicker(): void {
    this._onDidChange.fire();
    // 强制 VS Code 重新查询模型信息
    void vscode.lm.selectChatModels({ vendor: 'copilotpp' });
  }

  async prepareForDeactivate(): Promise<void> {
    this.isActive = false;
    this._onDidChange.fire();
    try {
      await vscode.lm.selectChatModels({ vendor: 'copilotpp' });
    } catch {
      // ignore
    }
  }

  dispose(): void {
    this._onDidChange.dispose();
  }

  // ─── 模型信息 ───

  async provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken,
  ): Promise<DuoYuanXModelInfo[]> {
    if (!this.isActive) return [];

    const hasKey = await this.configManager.hasApiKey();
    const providers = this.configManager.getProviders();
    const vendorCount = Object.keys(providers).length;

    logger.info(`provideLanguageModelChatInformation: hasKey=${hasKey}, providers=${vendorCount}`);

    if (vendorCount === 0) {
      logger.warn('无供应商配置，返回引导提示');
      return [];
    }

    try {
      // 强制刷新获取最新模型列表
      const models = await this.modelManager.getModels(true);
      logger.info(`API 返回 ${models.length} 个原始模型`);

      const chatModels = models.filter(m => m.modelType === 'text' && m.available);
      logger.info(`过滤后 ${chatModels.length} 个文本模型: ${chatModels.map(m => `${m.modelId}${(m as unknown as Record<string,unknown>).configurationSchema ? '[cfg]' : ''}`).join(', ')}`);

      const result = chatModels.map(m => {
        const schema = (m as unknown as Record<string, unknown>).configurationSchema;
        return {
          ...m,
          detail: hasKey ? m.detail : '请先设置 API Key',
          statusIcon: hasKey ? undefined : new vscode.ThemeIcon('warning'),
          ...(schema ? { configurationSchema: schema } : {}),
        };
      });

      // 如果 0 模型，记录详细信息用于诊断
      if (result.length === 0) {
        logger.error('0 个可用模型！原始模型详情:',
          JSON.stringify(models.map(m => ({ id: m.modelId, type: m.modelType, avail: m.available }))));
      }

      return result;
    } catch (err) {
      logger.error('获取模型列表异常:', err);
      return [];
    }
  }

  // ─── Token 估算 ───

  async provideTokenCount(
    _model: DuoYuanXModelInfo,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    if (typeof text === 'string') {
      return Math.ceil(text.length / this.charsPerToken);
    }

    // text has content as ReadonlyArray<LanguageModelInputPart | unknown>
    const content = text.content;
    let total = 0;
    for (const part of content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        total += part.value.length;
      }
    }
    return Math.max(1, Math.ceil(total / this.charsPerToken));
  }

  // ─── 聊天响应（核心）──

  /** 上下文保留比例：输出的 token 预算 */

  async provideLanguageModelChatResponse(
    model: DuoYuanXModelInfo,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const modelId = model.modelId;
    logger.info(`Chat 请求: model=${modelId}, messages=${messages.length}`);

    try {
      const settings = this.configManager.getModelSettings(modelId);

      const inputTokens = estimateMessagesTokens(messages, this.charsPerToken);

      // 更新状态栏
      this.statusBar?.update(
        model.name ?? modelId,
        inputTokens,
        settings.contextWindow,
      );

      // 构建 API 请求体（委托 RequestBuilder）
      const apiBody = this.requestBuilder.build(modelId, messages, options);

      // 🔧 多供应商路由：解析 vendor/ 前缀，使用对应供应商的 API
      let handler = this.streamHandler;
      const slashIdx = modelId.indexOf('/');
      if (slashIdx > 0) {
        const vendor = modelId.substring(0, slashIdx);
        const providers = this.configManager.getProviders();
        if (providers[vendor]) {
          // 创建供应商专属 ApiClient + StreamHandler
          const vendorClient = new DuoYuanXApiClient(
            () => providers[vendor]!.baseUrl,
            () => this.configManager.getApiKey(vendor),
            this.configManager.getRequestTimeout(),
          );
          handler = new StreamHandler(vendorClient);
          // 剔除 API 请求中的 vendor 前缀
          apiBody.model = modelId.substring(slashIdx + 1);
        }
      }

      // 流式响应
      const result = await handler.handle(apiBody, progress, token, modelId);

      // 更新 chars-per-token 估算
      this.charsPerToken = updateCharsPerToken(
        this.charsPerToken,
        result.contentLength,
        result.completionTokens,
      );

      // 更新状态栏
      this.statusBar?.update(modelId, undefined, undefined);
    } catch (err) {
      logger.error('Chat 请求失败:', err);
      await this.handleError(err, progress);
    }
  }

  /**
   * 智能上下文截断：分层窗口 + 语义过滤
   *
   * 三层结构：
   *   Layer 1: System 消息（始终保留）
   *   Layer 2: 关键消息（工具调用/结果、代码、文件路径 — 高分保留）
   *   Layer 3: 最近消息（按时间 + 与最新问题的相关性排序）
   */
  // ─── 错误处理 ───

  private async handleError(
    err: unknown,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  ): Promise<void> {
    let message: string;

    if (err instanceof DuoYuanXError) {
      message = ERROR_MESSAGES[err.code] ?? err.message;

      if (err.code === DuoYuanXErrorCode.INVALID_API_KEY) {
        vscode.window.showErrorMessage(`${message} 使用 "Copilot++: 设置 API Key" 命令配置。`);
      } else if (err.code === DuoYuanXErrorCode.MODEL_NOT_FOUND) {
        vscode.window.showWarningMessage(message);
      }
    } else {
      message = `发生未知错误: ${(err as Error).message ?? String(err)}`;
    }

    // 将错误作为回复返回
    progress.report(new vscode.LanguageModelTextPart(`❌ ${message}`));
  }
}
