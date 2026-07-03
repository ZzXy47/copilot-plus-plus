/**
 * modelSpecs.ts — 各AI大厂模型的参数规范数据库
 *
 * 数据来源：
 *   - Google Gemini: https://ai.google.dev/gemini-api/docs/models
 *   - DeepSeek: https://api-docs.deepseek.com/guides/thinking_mode
 *   - Anthropic Claude: https://docs.anthropic.com/en/docs/about-claude/models
 *   - OpenAI: https://platform.openai.com/docs/models
 *   - Kimi/MoonShot: https://platform.kimi.com
 *   - Zhipu GLM: https://docs.bigmodel.cn
 *   - Qwen: https://help.aliyun.com/zh/model-studio
 *   - MiniMax: https://platform.minimaxi.com
 *   - 豆包参考文档 (2026-06) 及 DESIGN_PLAN.md
 *
 * 最后更新: 2026-06-29
 */

import type { ThinkingType, ThinkingEffort } from '../models/settings';

// ── 类型定义 ──

/** 数值范围配置 */
export interface NumericSpec {
  default: number;
  min: number;
  max: number;
  /** 预设下拉选项（如果为空则用 min/max/step 自由输入） */
  options: number[];
}

/** 思考模式配置 */
export interface ThinkingSpec {
  /** 默认思考类型 */
  defaultType: ThinkingType;
  /** 是否允许关闭思考 */
  canDisable: boolean;
  /** 该模型支持的思考类型 */
  supportedTypes: ThinkingType[];
  /** 该模型支持的思考强度档位 */
  effortOptions: ThinkingEffort[];
}

/** 温度配置 */
export interface TemperatureSpec {
  default: number;
  min: number;
  max: number;
  /** 思考模式开启时 temperature 参数是否无效/被忽略 */
  disabledWhenThinking: boolean;
}

/** 单个模型/模型族的参数规范 */
export interface ModelParameterSpec {
  /** 匹配模式（支持通配符 *），如 "gpt-5*"、"deepseek-*"、"*" */
  matchPattern: string;
  /** 供应商标识 */
  vendor: string;
  /** 显示名称 */
  displayName: string;
  /** 上下文窗口规范 */
  contextWindow: NumericSpec;
  /** 最大输出 Token 规范 */
  maxOutputTokens: NumericSpec;
  /** 温度参数规范 */
  temperature: TemperatureSpec;
  /** 思考模式规范 */
  thinking: ThinkingSpec;
  /** 模型能力 */
  capabilities: {
    vision: boolean;
    tools: boolean;
  };
}

// ── 通用预设值 ──

export const COMMON_CTX_OPTIONS = [4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1_000_000];
export const COMMON_OUT_OPTIONS = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 384000];

// ── 模型规范数据库 ──

export const MODEL_SPECS: ModelParameterSpec[] = [
  // ═══════════════════════════════════════════════
  // OpenAI GPT 系列
  // ═══════════════════════════════════════════════
  {
    matchPattern: 'gpt-5*',
    vendor: 'openai',
    displayName: 'GPT-5 系列',
    contextWindow: {
      default: 128000,
      min: 4096,
      max: 128000,
      options: [4096, 8192, 16384, 32768, 65536, 128000],
    },
    maxOutputTokens: {
      default: 4096,
      min: 256,
      max: 16384,
      options: [512, 1024, 2048, 4096, 8192, 16384],
    },
    temperature: {
      default: 1.0,
      min: 0,
      max: 2.0,
      disabledWhenThinking: true,
    },
    thinking: {
      defaultType: 'disabled',
      canDisable: true,
      supportedTypes: ['disabled', 'reasoning_object'],
      effortOptions: ['low', 'medium', 'high', 'xhigh'],
    },
    capabilities: {
      vision: false,
      tools: true,
    },
  },
  {
    matchPattern: 'gpt-5.5*',
    vendor: 'openai',
    displayName: 'GPT-5.5',
    contextWindow: {
      default: 128000,
      min: 4096,
      max: 128000,
      options: [4096, 8192, 16384, 32768, 65536, 128000],
    },
    maxOutputTokens: {
      default: 4096,
      min: 256,
      max: 16384,
      options: [512, 1024, 2048, 4096, 8192, 16384],
    },
    temperature: {
      default: 1.0,
      min: 0,
      max: 2.0,
      disabledWhenThinking: true,
    },
    thinking: {
      defaultType: 'disabled',
      canDisable: true,
      supportedTypes: ['disabled', 'reasoning_object'],
      effortOptions: ['low', 'medium', 'high', 'xhigh'],
    },
    capabilities: {
      vision: true,
      tools: true,
    },
  },

  // ═══════════════════════════════════════════════
  // Anthropic Claude 系列
  // ═══════════════════════════════════════════════
  {
    matchPattern: 'claude-opus-4*',
    vendor: 'anthropic',
    displayName: 'Claude Opus 4 系列',
    contextWindow: {
      default: 200000,
      min: 32768,
      max: 200000,
      options: [32768, 65536, 100000, 200000],
    },
    maxOutputTokens: {
      default: 4096,
      min: 256,
      max: 16384,
      options: [512, 1024, 2048, 4096, 8192, 16384],
    },
    temperature: {
      default: 1.0,
      min: 0,
      max: 1.0,
      disabledWhenThinking: true,
    },
    thinking: {
      defaultType: 'thinking_adaptive',
      canDisable: false, // Claude 4.8 强制开启思考
      supportedTypes: ['thinking_adaptive', 'thinking_enabled'],
      effortOptions: ['low', 'medium', 'high', 'xhigh'],
    },
    capabilities: {
      vision: true,
      tools: true,
    },
  },
  {
    matchPattern: 'claude-sonnet-4*',
    vendor: 'anthropic',
    displayName: 'Claude Sonnet 4 系列',
    contextWindow: {
      default: 200000,
      min: 32768,
      max: 200000,
      options: [32768, 65536, 100000, 200000],
    },
    maxOutputTokens: {
      default: 8192,
      min: 256,
      max: 16384,
      options: [512, 1024, 2048, 4096, 8192, 16384],
    },
    temperature: {
      default: 1.0,
      min: 0,
      max: 1.0,
      disabledWhenThinking: true,
    },
    thinking: {
      defaultType: 'thinking_enabled',
      canDisable: true,
      supportedTypes: ['disabled', 'thinking_enabled'],
      effortOptions: ['low', 'medium', 'high', 'xhigh'],
    },
    capabilities: {
      vision: true,
      tools: true,
    },
  },

  // ═══════════════════════════════════════════════
  // Google Gemini 系列
  // ═══════════════════════════════════════════════
  {
    matchPattern: 'gemini-3*',
    vendor: 'google',
    displayName: 'Gemini 3 系列',
    contextWindow: {
      default: 1048576,
      min: 32768,
      max: 1048576,
      options: [32768, 65536, 131072, 262144, 524288, 1048576],
    },
    maxOutputTokens: {
      default: 8192,
      min: 256,
      max: 65536,
      options: [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
    },
    temperature: {
      default: 1.0,
      min: 0,
      max: 2.0,
      disabledWhenThinking: true,
    },
    thinking: {
      defaultType: 'thinking_config',
      canDisable: true,
      supportedTypes: ['disabled', 'thinking_config'],
      effortOptions: ['low', 'medium', 'high'],
    },
    capabilities: {
      vision: true,
      tools: true,
    },
  },

  // ═══════════════════════════════════════════════
  // DeepSeek 系列
  // ═══════════════════════════════════════════════
  {
    matchPattern: 'deepseek-v4*',
    vendor: 'deepseek',
    displayName: 'DeepSeek V4 系列',
    contextWindow: {
      default: 1000000,
      min: 32768,
      max: 1000000,
      options: [32768, 65536, 131072, 262144, 524288, 1000000],
    },
    maxOutputTokens: {
      default: 8192,
      min: 256,
      max: 384000,
      options: [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 384000],
    },
    temperature: {
      default: 1.0,
      min: 0,
      max: 2.0,
      disabledWhenThinking: true, // 思考模式下 temperature/top_p 不生效
    },
    thinking: {
      defaultType: 'disabled', // 默认关闭思考（非思考模式）
      canDisable: true,
      supportedTypes: ['disabled', 'thinking_type'],
      effortOptions: ['high', 'xhigh'], // low/medium 映射到 high, xhigh 映射到 max
    },
    capabilities: {
      vision: false,
      tools: true,
    },
  },
  {
    matchPattern: 'deepseek-r1*',
    vendor: 'deepseek',
    displayName: 'DeepSeek R1 系列',
    contextWindow: {
      default: 65536,
      min: 4096,
      max: 65536,
      options: [4096, 8192, 16384, 32768, 65536],
    },
    maxOutputTokens: {
      default: 4096,
      min: 256,
      max: 8192,
      options: [512, 1024, 2048, 4096, 8192],
    },
    temperature: {
      default: 0.7,
      min: 0,
      max: 2.0,
      disabledWhenThinking: true,
    },
    thinking: {
      defaultType: 'thinking_type',
      canDisable: false, // R1 始终思考
      supportedTypes: ['thinking_type'],
      effortOptions: ['high', 'xhigh'],
    },
    capabilities: {
      vision: false,
      tools: false,
    },
  },

  // ═══════════════════════════════════════════════
  // Alibaba Qwen 系列
  // ═══════════════════════════════════════════════
  {
    matchPattern: 'qwen*',
    vendor: 'qwen',
    displayName: 'Qwen 系列',
    contextWindow: {
      default: 1000000,
      min: 32768,
      max: 1000000,
      options: [32768, 65536, 131072, 262144, 524288, 1000000],
    },
    maxOutputTokens: {
      default: 4096,
      min: 256,
      max: 32768,
      options: [512, 1024, 2048, 4096, 8192, 16384, 32768],
    },
    temperature: {
      default: 0.7,
      min: 0,
      max: 2.0,
      disabledWhenThinking: true,
    },
    thinking: {
      defaultType: 'disabled',
      canDisable: true,
      supportedTypes: ['disabled', 'enable_thinking'],
      effortOptions: ['low', 'medium', 'high'],
    },
    capabilities: {
      vision: true,
      tools: true,
    },
  },

  // ═══════════════════════════════════════════════
  // Zhipu GLM 系列
  // ═══════════════════════════════════════════════
  {
    matchPattern: 'glm-5*',
    vendor: 'zhipu',
    displayName: 'GLM 5 系列',
    contextWindow: {
      default: 1000000,
      min: 32768,
      max: 1000000,
      options: [32768, 65536, 131072, 262144, 524288, 1000000],
    },
    maxOutputTokens: {
      default: 4096,
      min: 256,
      max: 32768,
      options: [512, 1024, 2048, 4096, 8192, 16384, 32768],
    },
    temperature: {
      default: 0.95,
      min: 0,
      max: 1.0,
      disabledWhenThinking: true,
    },
    thinking: {
      defaultType: 'thinking_level',
      canDisable: true,
      supportedTypes: ['disabled', 'thinking_level'],
      effortOptions: ['high', 'xhigh'],
    },
    capabilities: {
      vision: false,
      tools: true,
    },
  },
  {
    matchPattern: 'glm-4*',
    vendor: 'zhipu',
    displayName: 'GLM 4 系列',
    contextWindow: {
      default: 128000,
      min: 4096,
      max: 128000,
      options: [4096, 8192, 16384, 32768, 65536, 128000],
    },
    maxOutputTokens: {
      default: 4096,
      min: 256,
      max: 8192,
      options: [512, 1024, 2048, 4096, 8192],
    },
    temperature: {
      default: 0.95,
      min: 0,
      max: 1.0,
      disabledWhenThinking: false,
    },
    thinking: {
      defaultType: 'disabled',
      canDisable: true,
      supportedTypes: ['disabled', 'thinking_level'],
      effortOptions: ['medium', 'high'],
    },
    capabilities: {
      vision: true,
      tools: true,
    },
  },

  // ═══════════════════════════════════════════════
  // MoonShot Kimi 系列
  // ═══════════════════════════════════════════════
  {
    matchPattern: 'kimi*',
    vendor: 'moonshot',
    displayName: 'Kimi K2 系列',
    contextWindow: {
      default: 256000,
      min: 32768,
      max: 256000,
      options: [32768, 65536, 131072, 256000],
    },
    maxOutputTokens: {
      default: 4096,
      min: 256,
      max: 32768,
      options: [512, 1024, 2048, 4096, 8192, 16384, 32768],
    },
    temperature: {
      default: 0.7,
      min: 0,
      max: 2.0,
      disabledWhenThinking: false, // Kimi 思考模式下 temperature 仍然可用
    },
    thinking: {
      defaultType: 'disabled',
      canDisable: true,
      supportedTypes: ['disabled', 'preserve_thinking'],
      effortOptions: ['low', 'medium', 'high'],
    },
    capabilities: {
      vision: true,
      tools: true,
    },
  },

  // ═══════════════════════════════════════════════
  // MiniMax 系列
  // ═══════════════════════════════════════════════
  {
    matchPattern: 'minimax*',
    vendor: 'minimax',
    displayName: 'MiniMax M 系列',
    contextWindow: {
      default: 1000000,
      min: 32768,
      max: 1000000,
      options: [32768, 65536, 131072, 262144, 524288, 1000000],
    },
    maxOutputTokens: {
      default: 4096,
      min: 256,
      max: 32768,
      options: [512, 1024, 2048, 4096, 8192, 16384, 32768],
    },
    temperature: {
      default: 0.7,
      min: 0,
      max: 2.0,
      disabledWhenThinking: true,
    },
    thinking: {
      defaultType: 'disabled',
      canDisable: true,
      supportedTypes: ['disabled', 'thinking_enabled'],
      effortOptions: ['low', 'medium', 'high'],
    },
    capabilities: {
      vision: true,
      tools: true,
    },
  },

  // ═══════════════════════════════════════════════
  // 豆包/字节跳动 系列
  // ═══════════════════════════════════════════════
  {
    matchPattern: 'doubao*',
    vendor: 'doubao',
    displayName: '豆包 系列',
    contextWindow: {
      default: 128000,
      min: 4096,
      max: 128000,
      options: [4096, 8192, 16384, 32768, 65536, 128000],
    },
    maxOutputTokens: {
      default: 4096,
      min: 256,
      max: 16384,
      options: [512, 1024, 2048, 4096, 8192, 16384],
    },
    temperature: {
      default: 0.7,
      min: 0,
      max: 1.0,
      disabledWhenThinking: false,
    },
    thinking: {
      defaultType: 'disabled',
      canDisable: true,
      supportedTypes: ['disabled', 'enable_thinking'],
      effortOptions: ['low', 'medium', 'high'],
    },
    capabilities: {
      vision: true,
      tools: true,
    },
  },

  // ═══════════════════════════════════════════════
  // Xiaomi MiMo (小米)
  // ═══════════════════════════════════════════════
  {
    matchPattern: 'mimo*',
    vendor: 'xiaomi',
    displayName: 'MiMo 系列',
    contextWindow: {
      default: 256000,
      min: 4096,
      max: 256000,
      options: [4096, 8192, 16384, 32768, 65536, 131072, 256000],
    },
    maxOutputTokens: {
      default: 4096,
      min: 256,
      max: 16384,
      options: [512, 1024, 2048, 4096, 8192, 16384],
    },
    temperature: {
      default: 0.7,
      min: 0,
      max: 2.0,
      disabledWhenThinking: false,
    },
    thinking: {
      defaultType: 'disabled',
      canDisable: true,
      supportedTypes: ['disabled', 'thinking_enabled'],
      effortOptions: ['low', 'medium', 'high'],
    },
    capabilities: {
      vision: true,
      tools: true,
    },
  },

  // ═══════════════════════════════════════════════
  // 通配默认（兜底）
  // ═══════════════════════════════════════════════
  {
    matchPattern: '*',
    vendor: 'generic',
    displayName: '通用模型',
    contextWindow: {
      default: 128000,
      min: 4096,
      max: 1048576,
      options: COMMON_CTX_OPTIONS,
    },
    maxOutputTokens: {
      default: 4096,
      min: 256,
      max: 384000,
      options: COMMON_OUT_OPTIONS,
    },
    temperature: {
      default: 0.7,
      min: 0,
      max: 2.0,
      disabledWhenThinking: false,
    },
    thinking: {
      defaultType: 'disabled',
      canDisable: true,
      supportedTypes: ['disabled', 'auto'],
      effortOptions: ['low', 'medium', 'high'],
    },
    capabilities: {
      vision: false,
      tools: true,
    },
  },
];
