/**
 * ConfigManager — 多供应商配置管理
 */

import * as vscode from 'vscode';
import { SecretStore } from './SecretStore';
import { logger } from '../utils/logger';
import type { ModelSettingsMap, ModelSettings, ProviderConfig, ProvidersMap } from '../models/settings';
import { resolveModelSettings, inferVendorId } from '../models/settings';

/** 模型覆盖配置 */
export interface ModelOverride {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: string;
  thinkingEnabled?: boolean;
  maxReasoningTokens?: number;
  includeReasoning?: boolean;
  stream?: boolean;
}

/** 图像默认配置 */
export interface ImageDefaults {
  model: string;
  ratio: string;
  count: number;
  responseFormat: 'url' | 'b64_json';
}

export class ConfigManager {
  private readonly secretStore: SecretStore;

  constructor(context: vscode.ExtensionContext) {
    this.secretStore = new SecretStore(context);
  }

  getSecretStore(): SecretStore { return this.secretStore; }

  // ─── 多供应商 Key 管理 ───

  async getApiKey(vendor?: string): Promise<string | undefined> {
    if (vendor) return this.secretStore.get(vendor);
    // 兼容：取第一个供应商
    const providers = this.getProviders();
    const first = Object.keys(providers)[0];
    return first ? this.secretStore.get(first) : undefined;
  }

  async setApiKey(vendor: string, key: string): Promise<void> {
    await this.secretStore.set(vendor, key);
  }

  async deleteApiKey(vendor?: string): Promise<void> {
    if (vendor) {
      await this.secretStore.delete(vendor);
    } else {
      // 删除所有
      const providers = this.getProviders();
      for (const v of Object.keys(providers)) {
        await this.secretStore.delete(v);
      }
    }
  }

  /** @deprecated 使用 getProviders() 判断 */
  async hasApiKey(): Promise<boolean> {
    const providers = this.getProviders();
    if (Object.keys(providers).length > 0) return true;
    return this.secretStore.hasAnyKey();
  }

  // ─── 供应商管理 ───

  getProviders(): ProvidersMap {
    return vscode.workspace
      .getConfiguration('copilotpp')
      .get<ProvidersMap>('providers', {});
  }

  private async saveProviders(map: ProvidersMap): Promise<void> {
    await vscode.workspace
      .getConfiguration('copilotpp')
      .update('providers', map, vscode.ConfigurationTarget.Global);
  }

  /** 添加供应商，返回分配的 vendorId */
  async addProvider(baseUrl: string, apiKey: string, label?: string): Promise<string> {
    const normalized = this.normalizeBaseUrl(baseUrl);
    const vendorId = inferVendorId(normalized);
    const finalVendor = this.resolveUniqueVendor(vendorId);

    const providers = this.getProviders();
    providers[finalVendor] = {
      baseUrl: normalized,
      label: label || this.extractLabel(normalized, finalVendor),
      createdAt: Date.now(),
    };
    await this.saveProviders(providers);
    await this.secretStore.set(finalVendor, apiKey);
    logger.info(`供应商已添加: ${finalVendor} → ${normalized}`);
    return finalVendor;
  }

  /** 移除供应商及其 Key */
  async removeProvider(vendor: string): Promise<void> {
    const providers = this.getProviders();
    delete providers[vendor];
    await this.saveProviders(providers);
    await this.secretStore.delete(vendor);
    logger.info(`供应商已移除: ${vendor}`);
  }

  /** 获取供应商 URL */
  getProviderUrl(vendor: string): string {
    return this.getProviders()[vendor]?.baseUrl ?? '';
  }

  /** 获取供应商图像 URL（fallback 到主 URL） */
  getProviderImageUrl(vendor: string): string {
    const p = this.getProviders()[vendor];
    if (!p) return '';
    return p.imageBaseUrl || p.baseUrl;
  }

  /** 解析供应商名称冲突（openai → openai2） */
  private resolveUniqueVendor(base: string): string {
    const providers = this.getProviders();
    if (!providers[base]) return base;
    let i = 2;
    while (providers[`${base}${i}`]) i++;
    return `${base}${i}`;
  }

  /** 从 URL 提取友好标签 */
  private extractLabel(_url: string, vendor: string): string {
    const labels: Record<string, string> = {
      'openai': 'OpenAI', 'deepseek': 'DeepSeek', 'anthropic': 'Anthropic',
      'google': 'Google', 'qwen': 'Qwen', 'glm': 'GLM', 'kimi': 'Kimi',
      'minimax': 'MiniMax', 'doubao': 'Doubao', 'local': 'Local',
    };
    return labels[vendor] ?? vendor.charAt(0).toUpperCase() + vendor.slice(1);
  }

  /** 迁移旧版单供应商配置到新版 */
  async migrateFromLegacy(): Promise<boolean> {
    const oldUrl = this.getBaseUrl();
    if (!oldUrl) return false;

    const providers = this.getProviders();
    if (Object.keys(providers).length > 0) return false; // 已有供应商，不覆盖

    const vendor = await this.secretStore.migrateLegacy(inferVendorId(oldUrl));
    if (!vendor) return false;

    const provider: ProviderConfig = {
      baseUrl: oldUrl,
      label: this.extractLabel(oldUrl, vendor),
      createdAt: Date.now(),
    };
    providers[vendor] = provider;
    await this.saveProviders(providers);

    // 清除旧配置
    await vscode.workspace.getConfiguration('copilotpp').update('baseUrl', undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('copilotpp').update('imageBaseUrl', undefined, vscode.ConfigurationTarget.Global);
    logger.info(`旧配置已迁移: ${vendor}`);
    return true;
  }

  // ─── 通用配置（兼容旧 API）──

  getBaseUrl(): string {
    return vscode.workspace
      .getConfiguration('copilotpp')
      .get<string>('baseUrl', '');
  }

  getImageBaseUrl(): string {
    const imageUrl = vscode.workspace
      .getConfiguration('copilotpp')
      .get<string>('imageBaseUrl', '');
    return imageUrl || this.getBaseUrl();
  }

  /**
   * 标准化 API 地址：去除尾部 /v1/... 路径，保留纯域名
   * 用户可能输入 https://api.example.com/v1/chat/completions
   * → 标准化为 https://api.example.com
   */
  private normalizeBaseUrl(url: string): string {
    let cleaned = url.trim().replace(/\/+$/, ''); // 去尾部斜杠
    // 去除 /v1, /v1beta, /v1/ 等 API 路径后缀
    cleaned = cleaned.replace(/\/v1(beta)?(\/.*)?$/, '');
    return cleaned;
  }

  async setBaseUrl(url: string): Promise<void> {
    const normalized = this.normalizeBaseUrl(url);
    await vscode.workspace
      .getConfiguration('copilotpp')
      .update('baseUrl', normalized, vscode.ConfigurationTarget.Global);
  }

  // ─── 添加供应商对话框 ───

  /** 显示添加供应商的 URL + Key 对话框 */
  async promptForApiKey(): Promise<string | undefined> {
    // 1. URL
    const baseUrl = await vscode.window.showInputBox({
      prompt: 'API 地址（必填）— 如 https://api.openai.com',
      placeHolder: 'https://api.openai.com',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || !value.startsWith('http')) return '请输入以 http:// 或 https:// 开头的 URL';
        return null;
      },
    });
    if (!baseUrl) return undefined;

    // 2. API Key
    const key = await vscode.window.showInputBox({
      prompt: `API Key（${baseUrl}）`,
      placeHolder: 'sk-...',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length < 8) return 'API Key 格式不正确';
        return null;
      },
    });
    if (!key) return undefined;

    // 3. 添加供应商
    const vendor = await this.addProvider(baseUrl, key.trim());
    vscode.window.showInformationMessage(`✅ 供应商 ${vendor} 已添加 (${this.getProviderUrl(vendor)})`);
    return vendor;
  }

  getModelCacheTTL(): number {
    return vscode.workspace
      .getConfiguration('copilotpp')
      .get<number>('modelCacheTTL', 300);
  }

  getRequestTimeout(): number {
    return vscode.workspace
      .getConfiguration('copilotpp')
      .get<number>('requestTimeout', 120000);
  }

  // ─── 模型覆盖配置 ───

  getModelOverrides(): Record<string, ModelOverride> {
    return vscode.workspace
      .getConfiguration('copilotpp')
      .get<Record<string, ModelOverride>>('modelOverrides', {});
  }

  getModelOverride(modelId: string): ModelOverride | undefined {
    const overrides = this.getModelOverrides();
    return overrides[modelId];
  }

  // ─── 模型设置（copilotpp.models，替代 modelRegistry）──

  getModelSettingsMap(): ModelSettingsMap {
    return vscode.workspace
      .getConfiguration('copilotpp')
      .get<ModelSettingsMap>('models', {});
  }

  getModelSettings(modelId: string): Required<ModelSettings> {
    const map = this.getModelSettingsMap();
    return resolveModelSettings(map, modelId);
  }

  async saveModelSettings(map: ModelSettingsMap): Promise<void> {
    await vscode.workspace
      .getConfiguration('copilotpp')
      .update('models', map, vscode.ConfigurationTarget.Global);
  }

  // ─── 图像默认配置 ───

  getImageDefaults(): ImageDefaults {
    return vscode.workspace
      .getConfiguration('copilotpp')
      .get<ImageDefaults>('imageDefaults', {
        model: 'gpt-image-2',
        ratio: '1:1',
        count: 1,
        responseFormat: 'url',
      });
  }

  // ─── 监听配置变更 ───

  onConfigChange(listener: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('copilotpp')) {
        logger.debug('配置已变更');
        listener();
      }
    });
  }

  /** 显示 API URL + Key 设置对话框 */

  getDefaultModel(): string {
    return vscode.workspace.getConfiguration('copilotpp').get<string>('defaultModel', '');
  }
}
