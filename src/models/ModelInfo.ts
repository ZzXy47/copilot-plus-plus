/**
 * ModelInfo — VS Code 模型信息类型 + API 转换映射
 */

import * as vscode from 'vscode';
import type { ApiModelInfo } from '../api/types';
import type { ModelSettings, ThinkingType } from './settings';
import { resolveModelSpec } from '../services/ModelSpecProvider';
import { COMMON_CTX_OPTIONS, COMMON_OUT_OPTIONS } from '../data/modelSpecs';
import type { ModelParameterSpec, ThinkingSpec } from '../data/modelSpecs';

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

  // 如果没有用户设置，从模型规范数据库解析默认值
  const spec: ModelParameterSpec | undefined = resolveModelSpec(apiModel.id);

  // 确定有效的设置：优先用户设置，回退到规范默认值
  const effectiveSettings: Required<ModelSettings> = settings ?? {
    thinkingType: spec?.thinking.defaultType ?? 'disabled' as ThinkingType,
    thinkingEffort: spec?.thinking.effortOptions?.[1] ?? 'medium',
    thinkingCanDisable: spec?.thinking.canDisable ?? true,
    contextWindow: spec?.contextWindow.default ?? 128000,
    maxOutputTokens: spec?.maxOutputTokens.default ?? 4096,
    vision: spec?.capabilities.vision ?? false,
    tools: spec?.capabilities.tools ?? false,
  };

  const info: CopilotPPModelInfo = {
    id: apiModel.id,
    name,
    family,
    version: '1.0.0',
    maxInputTokens: effectiveSettings.contextWindow,
    maxOutputTokens: effectiveSettings.maxOutputTokens,
    detail: buildDetail(effectiveSettings),
    isBYOK: true,
    isUserSelectable: true,
    capabilities: {
      imageInput: effectiveSettings.vision,
      toolCalling: effectiveSettings.tools,
    },
    modelId: apiModel.id,
    modelType,
    available: true,
  };

  // 始终设置 configurationSchema，确保模型在下拉列表中可见且每供应商独立
  // 对于仅支持 disabled 的模型，仍然提供 contextWindow/maxOutputTokens 配置
  (info as unknown as Record<string, unknown>).configurationSchema = buildConfigurationSchema(
    effectiveSettings,
    spec
  );

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

function buildConfigurationSchema(settings: Required<ModelSettings>, fullSpec?: ModelParameterSpec): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const thinkingSpec = fullSpec?.thinking;

  // 上下文窗口配置 — 使用模型规范的预设值作为下拉选项
  // group: 'tokens' → VS Code 识别为「上下文大小」配置项
  const ctxOptions = fullSpec?.contextWindow.options ?? COMMON_CTX_OPTIONS;
  properties.contextWindow = {
    type: 'number',
    title: '上下文窗口',
    description: '模型单次可处理的 Token 上限',
    default: settings.contextWindow,
    enum: ctxOptions,
    enumItemLabels: ctxOptions.map(v => formatContextSize(v)),
    group: 'tokens',
  };

  // 最大输出 Token 配置 — 使用模型规范的预设值作为下拉选项
  const outOptions = fullSpec?.maxOutputTokens.options ?? COMMON_OUT_OPTIONS;
  properties.maxOutputTokens = {
    type: 'number',
    title: '最大输出 Token',
    description: '模型单次响应可生成的 Token 上限',
    default: settings.maxOutputTokens,
    enum: outOptions,
    enumItemLabels: outOptions.map(v => formatContextSize(v)),
    group: 'tokens',
  };

  // 思考类型配置 — 仅显示模型实际支持的思考模式
  const supportedTypes = thinkingSpec?.supportedTypes ?? ['disabled'];
  if (supportedTypes.length > 1 || supportedTypes[0] !== 'disabled') {
    const thinkingTypeLabels: Record<string, string> = {
      'disabled': '禁用思考',
      'reasoning_object': 'GPT (reasoning_object)',
      'thinking_type': 'DeepSeek V4 (reasoning_effort)',
      'thinking_adaptive': 'Claude 4.8 (自适应)',
      'thinking_enabled': 'Claude 4.7 (启用思考)',
      'enable_thinking': 'Qwen (enable_thinking)',
      'thinking_config': 'Gemini (thinking_config)',
      'thinking_level': 'GLM (thinking_level)',
      'preserve_thinking': 'Kimi (preserve_thinking)',
      'auto': '自动检测',
    };
    properties.thinkingType = {
      type: 'string',
      title: '思考模式',
      description: '选择模型支持的内置思考/推理模式',
      default: settings.thinkingType ?? thinkingSpec?.defaultType ?? 'disabled',
      enum: supportedTypes,
      enumItemLabels: supportedTypes.map(v => thinkingTypeLabels[v] ?? v),
      group: 'thinking_mode',
    };
  }

  // 思考参数配置（仅当模型支持思考时添加）
  // group: 'navigation' → VS Code 识别为「思考工作量」配置项
  const activeType = settings.thinkingType && settings.thinkingType !== 'disabled'
    ? settings.thinkingType
    : (thinkingSpec?.defaultType && thinkingSpec.defaultType !== 'disabled' ? thinkingSpec.defaultType : null);
  if (activeType) {
    const canDisable = thinkingSpec?.canDisable ?? true;
    const alwaysEnabled = !canDisable;

    // 优先使用模型规范的 effort 档位，回退到通用档位
    const specEfforts = thinkingSpec?.effortOptions;
    const effortOpts: string[] = specEfforts?.length
      ? specEfforts
      : (activeType === 'reasoning_object'
        ? (alwaysEnabled ? ['medium', 'high', 'xhigh'] : ['low', 'medium', 'high', 'xhigh'])
        : (alwaysEnabled ? ['medium', 'high'] : ['low', 'medium', 'high']));

    const labels: Record<string, string> = { 'low': '低', 'medium': '中', 'high': '高', 'xhigh': '超高' };
    const descriptions: Record<string, string> = {
      'low': '轻度推理，适合简单任务',
      'medium': '中度推理，适合一般任务',
      'high': '深度推理，适合复杂任务',
      'xhigh': '超深推理（Token 消耗显著增加）',
    };

    properties.reasoningEffort = {
      type: 'string',
      title: alwaysEnabled ? '推理深度' : '思考强度',
      enum: effortOpts,
      enumItemLabels: effortOpts.map(v => labels[v] ?? v),
      enumDescriptions: effortOpts.map(v => descriptions[v] ?? ''),
      default: settings.thinkingEffort ?? (specEfforts?.[1] ?? 'medium'),
      group: 'navigation',
      ...(alwaysEnabled ? { markdownDescription: '⚠️ 此模型始终启用思考，无法彻底关闭' } : {}),
    };
  }

  // 兜底：始终添加 reasoningEffort（即使 thinkingType=disabled）
  // group: 'navigation' → VS Code 识别为「思考工作量」配置项
  if (!properties.reasoningEffort) {
    properties.reasoningEffort = {
      type: 'string',
      title: '思考强度',
      enum: ['medium'],
      enumItemLabels: ['中'],
      enumDescriptions: ['默认推理强度'],
      default: 'medium',
      group: 'navigation',
    };
  }

  return { properties };
}

function formatContextSize(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = (tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 2);
    return `${m}M`;
  }
  const k = Math.round(tokens / 1000);
  return `${k}K`;
}
