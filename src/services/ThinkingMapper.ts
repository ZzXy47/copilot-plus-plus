/**
 * ThinkingMapper — 思考参数映射
 * UI 统一 低/中/高 三档 → 各模型 API 实际值
 */

import type { ThinkingType, ThinkingEffort } from '../models/settings';

export interface ThinkingParams {
  topLevel: Record<string, unknown>;
  extraBody: Record<string, unknown>;
}

export interface ThinkingState {
  active: boolean;
  disableTemperature: boolean;
}

/** UI 低/中/高/超高 → API 实际强度值 */
function mapEffort(type: ThinkingType, effort: ThinkingEffort): string | null {
  switch (type) {
    case 'thinking_type':  // DeepSeek: none/high/max
      return { low: 'none', medium: 'high', high: 'max', xhigh: 'max' }[effort];
    case 'thinking_level': // GLM: high/max（无 low 档，medium→high）
      return { low: null, medium: 'high', high: 'max', xhigh: 'max' }[effort] ?? 'high';
    case 'reasoning_object': // GPT: 直传（支持 xhigh）
    case 'thinking_config':   // Gemini: 直传（不支持 xhigh，降级为 high）
      return effort === 'xhigh' && type === 'thinking_config' ? 'high' : effort;
    default:
      return effort;
  }
}

export function buildThinkingParams(
  thinkingType: ThinkingType | undefined,
  effort: ThinkingEffort,
): ThinkingParams {
  const topLevel: Record<string, unknown> = {};
  const extraBody: Record<string, unknown> = {};

  if (!thinkingType || thinkingType === 'disabled') {
    return { topLevel, extraBody };
  }

  const apiEffort = mapEffort(thinkingType, effort);

  switch (thinkingType) {
    // GPT-5.5 / GPT-5.4: reasoning:{effort}
    case 'reasoning_object':
      if (apiEffort) {
        topLevel['reasoning'] = { effort: apiEffort };
      }
      break;

    // DeepSeek V4: reasoning_effort（顶层参数，非 thinking 对象）
    case 'thinking_type':
      if (apiEffort) topLevel['reasoning_effort'] = apiEffort;
      break;

    // Claude Opus 4.8: thinking:{type:"adaptive"}
    case 'thinking_adaptive':
      topLevel['thinking'] = { type: 'adaptive' };
      break;

    // Claude 4.7 / MiniMax: thinking:{type:"enabled"}
    case 'thinking_enabled':
      topLevel['thinking'] = { type: 'enabled' };
      break;

    // Qwen 3.7 Max: enable_thinking + reasoning
    case 'enable_thinking':
      topLevel['enable_thinking'] = true;
      topLevel['reasoning'] = { effort };
      break;

    // Gemini 3.1 Pro: thinkingConfig
    case 'thinking_config':
      if (apiEffort && apiEffort !== 'low') {
        topLevel['thinkingConfig'] = { thinking_level: apiEffort };
      }
      break;

    // GLM 5.2: thinking_level
    case 'thinking_level':
      if (apiEffort) topLevel['thinking_level'] = apiEffort;
      break;

    // Kimi K2.7 Code: preserve_thinking（强制开启）
    case 'preserve_thinking':
      topLevel['preserve_thinking'] = true;
      break;

    case 'auto':
      break;
  }

  return { topLevel, extraBody };
}

/**
 * 判断思考是否活跃（用于决定是否剥离 temperature 等不兼容参数）
 */
export function getThinkingState(
  thinkingType: ThinkingType | undefined,
  thinkingCanDisable: boolean | undefined,
  disableTemperature: boolean | undefined,
): ThinkingState {
  if (!thinkingType || thinkingType === 'disabled') {
    return { active: false, disableTemperature: false };
  }

  const active = !thinkingCanDisable;
  return {
    active,
    disableTemperature: active && (disableTemperature ?? false),
  };
}
