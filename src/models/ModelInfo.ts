/**
 * ModelInfo — VS Code 模型信息类型 + API 转换映射
 */

import * as vscode from 'vscode';
import type { ApiModelInfo } from '../api/types';
import type { ModelSettings } from './settings';

/** 扩展的 VS Code LM 模型信息 */
export interface CopilotPPModelInfo extends vscode.LanguageModelChatInformation {
  /** API 模型 ID */
  modelId: string;
  /** 模型类型 */
  modelType: 'text' | 'image';
  /** 是否可用 */
  available: boolean;
  /** BYOK 标识（Copilot Chat 识别用户自带 Key 的模型） */
  isBYOK: boolean;
  /** 明确可选标记 */
  isUserSelectable: boolean;
}

/**
 * 将 API 模型转换为 VS Code LanguageModelChatInformation
 * @param apiModel API 返回的原始模型信息
 * @param settings 来自 copilotpp.models 的用户设置
 */
export function toVSCodeModelInfo(apiModel: ApiModelInfo, settings?: Required<ModelSettings>): CopilotPPModelInfo {
  const family = inferFamily(apiModel.id);
  const modelType = apiModel.supported_endpoint_types?.includes('image-generation')
    ? 'image' : 'text';

  const name = toDisplayName(apiModel.id);

  const info: CopilotPPModelInfo = {
    id: apiModel.id,
    name,
    family,
    version: '1.0.0',
    maxInputTokens: settings?.contextWindow ?? 128000,
    maxOutputTokens: settings?.maxOutputTokens ?? 4096,
    detail: settings ? buildDetail(settings) : undefined,
    isBYOK: true,
    isUserSelectable: true,
    capabilities: {
      imageInput: settings?.vision ?? false,
      toolCalling: settings?.tools ?? false,
    },
    modelId: apiModel.id,
    modelType,
    available: true,
  };

  // 思考参数配置 UI（仅思考模型添加，避免非思考模型下拉异常）
  if (settings?.thinkingType && settings.thinkingType !== 'disabled') {
    (info as unknown as Record<string, unknown>).configurationSchema = buildConfigurationSchema(settings);
  }

  return info;
}

/** 推断模型族 */
export function inferFamily(id: string): string {
  const lower = id.toLowerCase();
  if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3')) return 'OpenAI';
  if (lower.includes('claude')) return 'Anthropic';
  if (lower.includes('gemini')) return 'Google';
  if (lower.includes('deepseek')) return 'DeepSeek';
  if (lower.includes('qwen')) return 'Qwen';
  if (lower.includes('glm')) return 'GLM';
  if (lower.includes('dall-e') || lower.includes('image')) return 'Image';
  return 'Other';
}

/** 获取模型的显示名 */
export function toDisplayName(id: string): string {
  const names: Record<string, string> = {
    'gpt-5.5': 'GPT-5.5',
    'gpt-5.5-pro': 'GPT-5.5 Pro',
    'claude-opus-4-8': 'Claude Opus 4.8',
    'gemini-3.1-pro': 'Gemini 3.1 Pro',
    'deepseek-v4-pro': 'DeepSeek V4 Pro',
    'qwen-3.7-max': 'Qwen 3.7 Max',
    'glm-5.2': 'GLM 5.2',
    'gpt-image-2': 'GPT Image 2',
    'gpt-image-2-all': 'GPT Image 2 All',
  };
  return names[id] ?? id;
}

// ── 内部工具函数 ──

function buildDetail(settings: Required<ModelSettings>): string {
  const parts: string[] = [];
  parts.push(formatContextSize(settings.contextWindow) + ' 上下文');

  if (settings.thinkingType && settings.thinkingType !== 'disabled') {
    parts.push(settings.thinkingCanDisable ? '可思考' : '始终思考');
  }
  if (settings.vision) parts.push('支持视觉');
  if (settings.tools) parts.push('工具调用');
  return parts.join(' · ');
}

function buildConfigurationSchema(settings: Required<ModelSettings>): Record<string, unknown> {
  const alwaysEnabled = !settings.thinkingCanDisable;
  // GPT 支持四档，其他三档
  const supportsXhigh = settings.thinkingType === 'reasoning_object';
  const values: string[] = supportsXhigh
    ? (alwaysEnabled ? ['medium', 'high', 'xhigh'] : ['low', 'medium', 'high', 'xhigh'])
    : (alwaysEnabled ? ['medium', 'high'] : ['low', 'medium', 'high']);
  const labels: Record<string, string> = { 'low': '低', 'medium': '中', 'high': '高', 'xhigh': '超高' };
  const descriptions: Record<string, string> = {
    'low': '轻度推理，适合简单任务',
    'medium': '中度推理，适合一般任务',
    'high': '深度推理，适合复杂任务',
    'xhigh': '超深推理（Token 消耗显著增加）',
  };

  return {
    properties: {
      reasoningEffort: {
        type: 'string',
        title: alwaysEnabled ? '推理深度' : '思考强度',
        enum: values,
        enumItemLabels: values.map(v => labels[v] ?? v),
        enumDescriptions: values.map(v => descriptions[v] ?? ''),
        default: settings.thinkingEffort ?? 'medium',
        group: 'navigation',
        ...(alwaysEnabled ? { markdownDescription: '⚠️ 此模型始终启用思考，无法彻底关闭' } : {}),
      },
    },
  };
}

function formatContextSize(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = (tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 2);
    return `${m}M`;
  }
  const k = Math.round(tokens / 1000);
  return `${k}K`;
}
