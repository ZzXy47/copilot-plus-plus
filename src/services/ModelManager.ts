/**
 * ModelManager — 模型列表管理
 * 从 API 动态获取模型列表 + 内存缓存
 */

import * as vscode from 'vscode';
import type { ApiModelInfo } from '../api/types';
import type { DuoYuanXModelInfo } from '../models/ModelInfo';
import { toVSCodeModelInfo } from '../models/ModelInfo';
import { DuoYuanXApiClient } from '../api/DuoYuanXApiClient';
import { ConfigManager } from './ConfigManager';
import { logger } from '../utils/logger';

export class ModelManager {
  private modelCache: DuoYuanXModelInfo[] = [];
  private lastFetchTime = 0;
  private unavailableModels = new Set<string>();
  /** 分供应商模型缓存 */
  private vendorCache = new Map<string, { models: DuoYuanXModelInfo[]; time: number }>();

  constructor(
    private readonly configManager: ConfigManager,
    private readonly apiClient: DuoYuanXApiClient,
  ) {}

  // ─── 模型列表获取 ───

  /**
   * 获取所有模型（多供应商合并，模型 ID 带 vendor/ 前缀）
   */
  async getModels(forceRefresh = false): Promise<DuoYuanXModelInfo[]> {
    const ttl = this.configManager.getModelCacheTTL() * 1000;
    const now = Date.now();

    if (!forceRefresh && this.modelCache.length > 0 && (now - this.lastFetchTime) < ttl) {
      return this.modelCache;
    }

    const providers = this.configManager.getProviders();
    const vendorIds = Object.keys(providers);

    if (vendorIds.length <= 1) {
      // 单供应商：直接用共享 ApiClient
      return this.fetchSingleProvider(vendorIds[0]);
    }

    // 多供应商：并行拉取，模型 ID 加前缀
    const allModels: DuoYuanXModelInfo[] = [];
    for (const vendor of vendorIds) {
      try {
        const models = await this.fetchFromVendor(vendor, forceRefresh);
        allModels.push(...models);
      } catch (err) {
        logger.warn(`获取供应商 ${vendor} 模型失败:`, err);
      }
    }

    this.modelCache = allModels;
    this.lastFetchTime = now;
    logger.info(`已加载 ${allModels.length} 个模型 (${vendorIds.length} 个供应商)`);
    return allModels;
  }

  /** 单供应商获取（使用共享 ApiClient，无前缀） */
  private async fetchSingleProvider(vendor?: string): Promise<DuoYuanXModelInfo[]> {
    try {
      const resp = await this.apiClient.listModels();
      const apiModels = resp.data ?? [];
      const models = apiModels
        .filter(m => this.isRelevantModel(m))
        .map(m => {
          const settings = this.configManager.getModelSettings(m.id);
          const info = toVSCodeModelInfo(m, settings);
          if (this.unavailableModels.has(m.id)) info.available = false;
          return info;
        });
      this.modelCache = models;
      this.lastFetchTime = Date.now();
      logger.info(`已加载 ${models.length} 个模型${vendor ? ` (${vendor})` : ''}`);
      return models;
    } catch (err) {
      logger.error('获取模型列表失败:', err);
      return this.modelCache.length > 0 ? this.modelCache : [];
    }
  }

  /** 从指定供应商获取模型（模型 ID 加 vendor/ 前缀） */
  async fetchFromVendor(vendor: string, forceRefresh = false): Promise<DuoYuanXModelInfo[]> {
    const ttl = this.configManager.getModelCacheTTL() * 1000;
    const now = Date.now();
    const cached = this.vendorCache.get(vendor);

    if (!forceRefresh && cached && (now - cached.time) < ttl) {
      return cached.models;
    }

    const provider = this.configManager.getProviders()[vendor];
    if (!provider) return [];

    const vendorClient = new DuoYuanXApiClient(
      () => provider.baseUrl,
      () => this.configManager.getApiKey(vendor),
      this.configManager.getRequestTimeout(),
    );

    try {
      const resp = await vendorClient.listModels();
      const apiModels = resp.data ?? [];
      const prefix = vendor + '/';

      const models = apiModels
        .filter(m => this.isRelevantModel(m))
        .map(m => {
          const prefixedId = prefix + m.id;
          const settings = this.configManager.getModelSettings(m.id);
          // 用原始 ID 生成信息，然后覆盖 ID 为带前缀的
          const info = toVSCodeModelInfo(m, settings);
          (info as any).id = prefixedId;
          info.modelId = prefixedId;
          // 追加供应商标签到名称，避免多供应商同名模型混淆
          (info as any).name = `${info.name} (${provider.label})`;
          if (this.unavailableModels.has(prefixedId)) info.available = false;
          return info;
        });

      this.vendorCache.set(vendor, { models, time: now });
      logger.info(`供应商 ${vendor}: ${models.length} 个模型`);
      return models;
    } catch (err) {
      logger.error(`获取供应商 ${vendor} 模型失败:`, err);
      return cached?.models ?? [];
    }
  }

  /** 获取指定供应商的模型（无前缀，用于 Webview 按供应商展示） */
  async getModelsForVendor(vendor: string): Promise<DuoYuanXModelInfo[]> {
    const provider = this.configManager.getProviders()[vendor];
    if (!provider) return [];

    const vendorClient = new DuoYuanXApiClient(
      () => provider.baseUrl,
      () => this.configManager.getApiKey(vendor),
      this.configManager.getRequestTimeout(),
    );

    try {
      const resp = await vendorClient.listModels();
      return (resp.data ?? [])
        .filter(m => this.isRelevantModel(m))
        .map(m => {
          const settings = this.configManager.getModelSettings(m.id);
          const info = toVSCodeModelInfo(m, settings);
          if (this.unavailableModels.has(m.id)) info.available = false;
          return info;
        });
    } catch {
      return [];
    }
  }

  /**
   * 获取聊天模型列表
   */
  async getChatModels(): Promise<DuoYuanXModelInfo[]> {
    const models = await this.getModels();
    return models
      .filter(m => m.modelType === 'text' && m.available);
  }

  /**
   * 获取图像模型列表
   */
  async getImageModels(): Promise<DuoYuanXModelInfo[]> {
    const models = await this.getModels();
    return models
      .filter(m => m.modelType === 'image');
  }

  // ─── 模型查找 ───

  /**
   * 查找指定模型
   */
  async findModel(modelId: string): Promise<DuoYuanXModelInfo | undefined> {
    const models = await this.getModels();
    return models.find(m => m.modelId === modelId);
  }

  /**
   * 获取默认模型
   */
  async getDefaultModel(): Promise<DuoYuanXModelInfo | undefined> {
    const defaultModelId = this.configManager.getDefaultModel();
    return this.findModel(defaultModelId);
  }

  // ─── 不可用模型管理 ───

  /**
   * 标记模型为不可用
   */
  markUnavailable(modelId: string): void {
    this.unavailableModels.add(modelId);
    // 更新缓存中的标记
    const cached = this.modelCache.find(m => m.modelId === modelId);
    if (cached) {
      cached.available = false;
    }
    logger.warn(`模型 ${modelId} 已标记为不可用`);
  }

  /**
   * 清除不可用标记（API Key 更新后）
   */
  clearUnavailable(): void {
    this.unavailableModels.clear();
    this.modelCache.forEach(m => {
      m.available = true;
    });
  }

  // ─── 刷新 ───

  /**
   * 强制刷新模型列表
   */
  async refreshModels(): Promise<DuoYuanXModelInfo[]> {
    this.lastFetchTime = 0;  // 失效缓存
    return this.getModels(true);
  }

  /**
   * 刷新模型选择器（通知 VS Code 更新 UI）
   */
  refreshModelPicker(emitter: vscode.EventEmitter<void>): void {
    this.lastFetchTime = 0;  // 失效缓存
    emitter.fire();
  }

  // ─── 内部方法 ───

  /**
   * 判断模型是否与插件相关
   */
  private isRelevantModel(model: ApiModelInfo): boolean {
    const id = model.id.toLowerCase();
    const irrelevant = ['whisper', 'tts', 'embedding', 'moderation', 'dall-e'];
    if (irrelevant.some(w => id.includes(w))) return false;

    // 无端点类型信息时也接受（通用 OpenAI 兼容 API 通常不返回 supported_endpoint_types）
    return true;
  }
}
