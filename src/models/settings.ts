/**
 * 模型设置类型 — 来自 copilotpp.models 配置
 * 替代旧的 modelRegistry.ts 硬编码
 */

/** 思考模式类型 */
export type ThinkingType =
  | 'disabled'
  | 'reasoning_object'     // GPT: reasoning:{effort}
  | 'thinking_type'        // DeepSeek: reasoning_effort
  | 'thinking_adaptive'    // Claude 4.8: thinking:{type:"adaptive"}
  | 'thinking_enabled'     // Claude 4.7 / MiniMax: thinking:{type:"enabled"}
  | 'enable_thinking'      // Qwen: enable_thinking + reasoning
  | 'thinking_config'      // Gemini: thinkingConfig
  | 'thinking_level'       // GLM: thinking_level
  | 'preserve_thinking'    // Kimi: preserve_thinking
  | 'auto';

/** 思考努力程度 */
export type ThinkingEffort = 'low' | 'medium' | 'high' | 'xhigh';

/** 单个模型的自定义设置 */
export interface ModelSettings {
  /** 上下文窗口大小 (tokens)，默认 128000 */
  contextWindow?: number;
  /** 最大输出 Token 数，默认 4096 */
  maxOutputTokens?: number;
  /** 是否支持视觉/多模态，默认 false */
  vision?: boolean;
  /** 是否支持工具调用，默认 false */
  tools?: boolean;
  /** 思考模式类型，默认 disabled */
  thinkingType?: ThinkingType;
  /** 思考强度，默认 medium */
  thinkingEffort?: ThinkingEffort;
  /** 思考是否可以关闭，默认 false（总是思考） */
  thinkingCanDisable?: boolean;
  /** 思考活跃时是否剥离 temperature 参数 */
  disableTemperatureWhenThinking?: boolean;
}

/** 供应商配置 */
export interface ProviderConfig {
  baseUrl: string;
  imageBaseUrl?: string;
  label: string;          // 显示名，自动从 URL 提取
  createdAt: number;      // 添加时间戳
}

/** 供应商集合（key = 供应商 ID，如 "openai" / "deepseek"） */
export type ProvidersMap = Record<string, ProviderConfig>;

/** 从 URL 域名自动推断供应商 ID */
export function inferVendorId(url: string): string {
  try {
    const host = new URL(url).hostname;
    // 移除 www. 前缀，取主域名
    const parts = host.replace(/^www\./, '').split('.');
    // 如 api.openai.com → openai, api.deepseek.com → deepseek
    const main = parts.length >= 2 ? parts[parts.length - 2]! : parts[0]!;
    // 常见映射
    const map: Record<string, string> = {
      'openai': 'openai', 'deepseek': 'deepseek', 'anthropic': 'anthropic',
      'google': 'google', 'qwen': 'qwen', 'zhipu': 'glm', 'bigmodel': 'glm',
      'moonshot': 'kimi', 'minimax': 'minimax', 'doubao': 'doubao',
      'localhost': 'local', '127.0.0.1': 'local',
    };
    return map[main] ?? main;
  } catch {
    return 'custom';
  }
}

/** 模型设置集合（key = model id 或 "*" 通配） */
export type ModelSettingsMap = Record<string, ModelSettings>;

/** 默认通配设置 */
export const DEFAULT_MODEL_SETTINGS: Required<ModelSettings> = {
  contextWindow: 128000,
  maxOutputTokens: 4096,
  vision: false,
  tools: false,
  thinkingType: 'disabled',
  thinkingEffort: 'medium',
  thinkingCanDisable: true,
  disableTemperatureWhenThinking: false,
};

/**
 * 从设置 map 中获取指定模型的合并设置
 * 先查精确匹配，再查 "*" 通配，最后用默认值
 */
export function resolveModelSettings(
  modelSettingsMap: ModelSettingsMap | undefined,
  modelId: string,
): Required<ModelSettings> {
  const defaults = { ...DEFAULT_MODEL_SETTINGS };

  if (!modelSettingsMap) return defaults;

  // 通配默认
  const wildcard = modelSettingsMap['*'];
  if (wildcard) Object.assign(defaults, wildcard);

  // 精确匹配
  const exact = modelSettingsMap[modelId];
  if (exact) Object.assign(defaults, exact);

  return defaults;
}
