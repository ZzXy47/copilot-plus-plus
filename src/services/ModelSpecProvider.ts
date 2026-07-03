/**
 * ModelSpecProvider.ts — 模型参数规范匹配器
 *
 * 根据模型 ID（如 "deepseek-v4-pro"）模糊匹配对应的参数规范。
 * 匹配逻辑：
 *   1. 遍历 MODEL_SPECS，用通配符模式 glob-match 模型 ID
 *   2. 越具体的模式优先级越高（* 兜底最低）
 *   3. 返回匹配的规范 + 针对该模型的智能推荐
 */

import { MODEL_SPECS, type ModelParameterSpec } from '../data/modelSpecs';

// ── 模糊匹配工具 ──

/**
 * 将通配符模式转为 RegExp
 * 规则：
 *   - `*` 匹配任意字符序列（非贪婪）
 *   - `?` 匹配单个字符
 *   - 其余字符原样匹配
 *   - 大小写不敏感
 */
function patternToRegex(pattern: string): RegExp {
  // 转义正则特殊字符，但保留 * 和 ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // * → .*?  (非贪婪)
  // ? → .
  const regexStr = escaped
    .replace(/\*/g, '.*?')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexStr}$`, 'i');
}

/**
 * 计算模式的具体程度（越高越优先）
 * 粗略估算：模式长度 - 通配符数量
 */
function patternSpecificity(pattern: string): number {
  let score = pattern.length;
  for (const ch of pattern) {
    if (ch === '*') { score -= 5; }
    if (ch === '?') { score -= 3; }
  }
  return score;
}

// 预编译正则 + 排序（一次性）
interface CompiledSpec {
  regex: RegExp;
  spec: ModelParameterSpec;
  specificity: number;
}

const compiledSpecs: CompiledSpec[] = MODEL_SPECS
  .map(s => ({
    regex: patternToRegex(s.matchPattern),
    spec: s,
    specificity: patternSpecificity(s.matchPattern),
  }))
  .sort((a, b) => b.specificity - a.specificity); // 高优先级在前

// ── 查询 API ──

/**
 * 根据模型 ID 查找最匹配的参数规范
 *
 * @param modelId - 模型 ID，如 "deepseek-v4-pro"、"gpt-5.5"、或是带 vendor 前缀的 "deepseek/deepseek-v4-pro"
 * @returns 匹配到的规范；兜底返回通配 *
 */
export function resolveModelSpec(modelId: string): ModelParameterSpec {
  const normalized = modelId.trim().toLowerCase();

  // 1) 用完整 ID 匹配（包括可能的 vendor 前缀）
  for (const { regex, spec } of compiledSpecs) {
    if (regex.test(normalized)) {
      return spec;
    }
  }

  // 2) 去掉供应商前缀后再试一次（如 "deepseek/deepseek-v4-pro" → "deepseek-v4-pro"）
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash >= 0) {
    const stripped = normalized.substring(lastSlash + 1);
    for (const { regex, spec } of compiledSpecs) {
      if (regex.test(stripped)) {
        return spec;
      }
    }
  }

  // 3) 兜底：最后一个规范（通配 *）
  return compiledSpecs[compiledSpecs.length - 1]!.spec;
}

/**
 * 批量解析多个模型 ID 的规范
 */
export function resolveModelSpecs(modelIds: string[]): Map<string, ModelParameterSpec> {
  const result = new Map<string, ModelParameterSpec>();
  for (const id of modelIds) {
    // 避免重复解析
    const key = id.trim().toLowerCase();
    if (!result.has(key)) {
      result.set(key, resolveModelSpec(id));
    }
  }
  return result;
}

// ── 智能推荐 ──

/** 根据模型规范给出"推荐"的上下文窗口大小 */
export function recommendContextWindow(spec: ModelParameterSpec, modelId: string): number {
  // 根据实际模型 ID 微调
  const lower = modelId.toLowerCase();

  if (spec.vendor === 'deepseek' && lower.includes('v4-pro')) {
    return 1_000_000; // DeepSeek V4 Pro 完整窗口
  }
  if (spec.vendor === 'anthropic') {
    return 200_000;
  }
  if (spec.vendor === 'google' && lower.includes('pro')) {
    return 1_048_576;
  }

  return spec.contextWindow.default;
}

/** 根据模型规范给出"推荐"的最大输出 Token */
export function recommendMaxOutputTokens(spec: ModelParameterSpec, modelId: string): number {
  const lower = modelId.toLowerCase();

  if (spec.vendor === 'deepseek') {
    if (lower.includes('v4-pro')) { return 384_000; }
    if (lower.includes('r1')) { return 4096; }
  }
  if (spec.vendor === 'google' && lower.includes('pro')) {
    return 32768;
  }

  return spec.maxOutputTokens.default;
}

// ── 预计算的下拉选项 ──

/**
 * 获取上下文窗口的推荐下拉选项
 * 会尝试把"推荐值"插入到固定选项中
 */
export function getContextWindowOptions(spec: ModelParameterSpec, modelId: string): number[] {
  const recommended = recommendContextWindow(spec, modelId);
  const options = [...spec.contextWindow.options];
  if (!options.includes(recommended)) {
    options.push(recommended);
    options.sort((a, b) => a - b);
  }
  return options;
}

/**
 * 获取最大输出 Token 的推荐下拉选项
 */
export function getMaxOutputTokenOptions(spec: ModelParameterSpec, modelId: string): number[] {
  const recommended = recommendMaxOutputTokens(spec, modelId);
  const options = [...spec.maxOutputTokens.options];
  if (!options.includes(recommended)) {
    options.push(recommended);
    options.sort((a, b) => a - b);
  }
  return options;
}
