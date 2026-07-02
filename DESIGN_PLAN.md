# Copilot++ (Copilot++) VS Code Copilot 插件 — 完整设计方案 v3.1

> **版本**: v3.1（基于 DeepSeek/Kimi for Copilot 参考校正版）  
> **日期**: 2026-06-30  
> **目标**: 将Copilot++ API **当前 Key 可用**的 8 个模型完整接入 VS Code Copilot Chat  
> **状态**: ✅ 已验证可行，可正式开发  
> **VS Code**: ^1.120.0 | **Node**: >=24 | **enabledApiProposals**: []

---

## 🇬🇧 English Abstract

This document is the complete technical design for the **Copilot++** VS Code extension, which bridges any OpenAI-compatible API to GitHub Copilot Chat through a custom `LanguageModelChatProvider` implementation.

### Key Highlights

| Area | Summary |
|------|---------|
| **Validated Models** | 8 models verified with real API keys: GPT-5.5, Claude Opus 4.8, Gemini 3.1 Pro, DeepSeek V4 Pro, Qwen 3.7 Max, GLM 5.2, GPT Image 2, GPT Image 2 (All) |
| **Architecture** | Single `ChatProvider` class implementing VS Code's `LanguageModelChatProvider` interface, with pluggable thinking-mode handlers per model family |
| **Thinking Modes** | 9 parameter patterns unified under a **Low / Medium / High** effort selector — each auto-mapped to the model's native API format (`reasoning.effort`, `thinking.type`, `enable_thinking`, etc.) |
| **Image Generation** | Integrated DALL·E-compatible image endpoint with Webview preview, resolution picker (1024×1024 / 1792×1024 / 1024×1792), quality options (standard/hd), and save-to-disk |
| **Secret Management** | API keys stored in VS Code's `SecretStorage` with multi-key support; GLM XML leak filtering and tool-call accumulation safeguards |
| **Dev Phases** | 4 phases over 8 weeks: Core Provider → Webview Config → Image Gen → Polish & Ship |

### Architecture at a Glance

```
User (Copilot Chat)
    │
    ▼
ChatProvider (LanguageModelChatProvider)
    ├── RequestBuilder    — builds OpenAI-compatible request body
    ├── ThinkingMapper    — maps effort level → model-specific params
    ├── ApiClient         — HTTP POST + SSE streaming
    ├── StreamHandler     — SSE chunks → VS Code LanguageModelTextPart
    ├── ConfigManager     — multi-provider settings (URL, key, models)
    ├── ModelManager      — fetches /v1/models per provider
    ├── ImageGenerator    — DALL·E-compatible image endpoint
    └── SecretStore       — encryption-backed key storage
```

The full document below (in Chinese) contains detailed model registry code, parameter mapping tables, error handling strategies, and implementation checklists.

---

---

## ⚡ 模型验证结果摘要

通过 API Key `sk-CeCKM8eHQORLh0NMDc46Fb79F40f4c87A9F3646b165c52F3` 实际测试：

| 模型 ID | 类型 | 可用性 | 端点类型 |
|---------|------|:------:|---------|
| `gpt-5.5` | 文本/多模态 | ✅ | openai, openai-response |
| `claude-opus-4-8` | 文本/多模态 | ✅ | openai (vertex-ai) |
| `gemini-3.1-pro-preview` | 文本/多模态 | ✅ | openai (vertex-ai) |
| `deepseek-v4-pro` | 文本 | ✅ | openai (deepseek) |
| `qwen3.7-max` | 文本/多模态 | ✅ | openai |
| `glm-5.2` | 文本 | ✅ | openai |
| `gpt-image-2` | 图像生成 | ✅ | image-generation |
| `gpt-image-2-all` | 图像生成 | ✅ | image-generation |
| ~~`gpt-5.5-pro`~~ | — | ❌ | 无可用渠道 |
| ~~`gemini-3-pro-image-preview-2K`~~ | — | ❌ | 无可用渠道 |

---

## 一、模型能力完整矩阵

### 1.1 文本模型核心规格（豆包参考文档校正版）

| 模型 | 上下文 | 最大输出 | 视觉 | 思考默认 | 思考参数结构 | 思考强度 | 可关闭 | 工具调用 | 结构化输出 |
|------|--------|---------|:----:|:------:|------------|---------|:-----:|:-------:|:--------:|
| **gpt-5.5** | ~128K | ~16K | ✅ | 关闭 | `reasoning:{effort, max_reasoning_tokens, include_reasoning}` | none/low/medium/high/**xhigh** | ✅ | ✅ | ✅ |
| **claude-opus-4-8** | ~200K | ~16K | ✅ | **强制开启** | `thinking:{enabled, effort, display}` | low/medium/high/max | ❌ | ✅ | — |
| **gemini-3.1-pro-preview** | ~1M | ~64K | ✅ | 开启 | `thinkingConfig:{thinking_level, include_thoughts, max_thinking_tokens}` | low/medium/high | ✅(low≈关) | ✅ | — |
| **deepseek-v4-pro** | 1M | 384K | ❌ | **关闭** | `thinking:{type, show_reasoning}` (extra_body) | disabled/high/max | ✅ | ✅ | ❌ |
| **qwen3.7-max** | 1M | ~32K | ✅ | **关闭** | `enable_thinking` + `reasoning:{effort}` + `thinking_budget` | low/medium/high | ✅ | ✅ | ❌ |
| **glm-5.2** | 1M | ~32K | ❌ | 开启 | `thinking_level` + `disable_thinking` + `show_reasoning_content` | high/max | ✅ | ✅ | ✅ |

### 1.2 图像模型核心规格

| 模型 | 入口 | 尺寸档位 | 参考图 | 返回格式 | 数量 |
|------|------|---------|:-----:|---------|:---:|
| **gpt-image-2** | `/v1/images/generations` | 1024² ~ 1920×1080 | `image:[base64]` | url / b64_json | 1 |
| **gpt-image-2-all** | `/v1/images/generations` | 1024² ~ 1920×1080 | `image:[base64]` | url / b64_json | 1 |

### 1.3 思考/推理模式详解（来源：豆包官方参考文档 2026-06）

```
模型                    开启方式                              关闭/降级方式              默认状态
──────────────────────────────────────────────────────────────────────────────────────────
gpt-5.5           reasoning:{effort:"medium"/"high"    reasoning:{effort:"none"}    默认关闭
                  /"xhigh"}                            (Instant 极速模式)            eff≈medium时开启
                  + max_reasoning_tokens:N
                  + include_reasoning:true

claude-opus-4-8   thinking:{enabled:true,              thinking.effort:"low"         强制开启
                  effort:"high"/"max",                (无法彻底关闭，                enabled默认true
                  display:"full"}                     仅降推理深度)
                  (支持顶层简写 effort)

deepseek-v4-pro   thinking:{type:"high"/"max"}        thinking:{type:"disabled"}    默认关闭⚠️
                  + show_reasoning:true                (Non-Think 极速)              (非之前假设的开启)
                  (兼容顶层 reasoning_effort)

qwen3.7-max       enable_thinking:true                 enable_thinking:false          默认关闭⚠️
                  + reasoning:{effort:"high"}          (直接回复模式)                 (非之前假设的开启)
                  + thinking_budget:32768

glm-5.2           thinking_level:"max"                 disable_thinking:true          默认 high
                  + show_reasoning_content:true        (可关闭!⚠️)                    (可关闭，非始终思考)

gemini-3.1-pro    thinkingConfig:{                     thinking_level:"low"          默认 high
                  thinking_level:"high",               (等效关闭深思考)
                  include_thoughts:true,
                  max_thinking_tokens:65536}
```

---

## 二、插件架构设计

### 2.1 架构总览

```
┌──────────────────────────────────────────────────────────┐
│                     VS Code Copilot Chat                   │
│  ┌────────────────────────────────────────────────────┐   │
│  │              Model Selector (模型选择器)              │   │
│  │  gpt-5.5 │ claude-opus-4-8 │ gemini-3.1-pro-preview │   │
│  │  deepseek-v4-pro │ qwen3.7-max │ glm-5.2            │   │
│  └────────────────────────────────────────────────────┘   │
│                           │                                │
│                           ▼                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │           Copilot++ChatProvider                       │   │
│  │     implements LanguageModelChatProvider             │   │
│  │                                                      │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │          Thinking Mode Manager                │   │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │   │   │
│  │  │  │GPT风格   │ │Claude风格│ │Qwen/GLM风格  │ │   │   │
│  │  │  │reasoning │ │thinking  │ │enable_       │ │   │   │
│  │  │  │_effort   │ │budget    │ │thinking      │ │   │   │
│  │  │  └──────────┘ └──────────┘ └──────────────┘ │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └────────────────────────────────────────────────────┘   │
│                           │                                │
│                           ▼                                │
│              POST /v1/chat/completions                      │
│              POST /v1/images/generations                    │
│              https://copilot-plus-plus.com                           │
└──────────────────────────────────────────────────────────┘
```

### 2.2 核心设计原则

1. **动态模型发现** — 从 API `GET /v1/models` 实时获取模型列表，结合本地 `MODEL_REGISTRY` 补充能力信息；不可用模型（无渠道）对用户可见，帮助诊断连接问题
2. **思考模式深度可配** — 每个模型独立配置思考参数，通过 VS Code 原生 `configurationSchema` 在模型选择器中直接调节 + `settings.json` 批量配置双通道
3. **单协议统一接入** — 所有 8 个模型均通过 `POST /v1/chat/completions`（文本）和 `POST /v1/images/generations`（图像）统一接入
4. **不可用模型优雅降级** — 标记为不可用但不报错，用户能直观看到哪些模型因渠道问题无法连接

---

## 三、项目目录结构

```
copilot-plus-plus-copilot/
├── .vscode/
│   ├── launch.json
│   └── tasks.json
├── src/
│   ├── extension.ts                  # 插件入口
│   ├── commands.ts                   # 命令注册
│   │
│   ├── provider/
│   │   └── Copilot++ChatProvider.ts   # LanguageModelChatProvider 实现
│   │
│   ├── services/
│   │   ├── ModelManager.ts           # 模型列表获取/缓存
│   │   ├── ConfigManager.ts          # 配置管理
│   │   ├── ThinkingModeManager.ts    # 思考模式参数映射
│   │   ├── ImageGenerator.ts         # 图像生成服务
│   │   └── TokenCounter.ts           # Token 估算
│   │
│   ├── api/
│   │   ├── Copilot++ApiClient.ts      # HTTP 客户端 (fetch + SSE)
│   │   ├── types.ts                  # API 类型定义
│   │   └── errors.ts                 # 错误处理
│   │
│   ├── models/
│   │   ├── modelRegistry.ts          # 8模型能力注册表
│   │   └── ModelInfo.ts              # 模型信息类型
│   │
│   ├── config/
│   │   ├── settings.ts               # VS Code settings contribution
│   │   └── defaults.ts               # 模型默认参数
│   │
│   └── utils/
│       ├── sseParser.ts              # SSE 流解析
│       ├── messageConverter.ts       # 消息格式转换
│       └── logger.ts                 # 日志
│
├── package.json
├── tsconfig.json
├── esbuild.config.js
└── README.md
```

---

## 四、模型能力注册表（核心代码骨架）

```typescript
// src/models/modelRegistry.ts

/** 思考模式类型（基于豆包官方参考文档 2026-06） */
type ThinkingType =
  | 'reasoning_object'    // GPT-5.5: reasoning:{effort, max_reasoning_tokens, include_reasoning}
  | 'thinking_object'     // Claude Opus 4.8: thinking:{enabled, effort, display}
  | 'thinking_type'       // DeepSeek V4 Pro: thinking:{type, show_reasoning}
  | 'enable_thinking'     // Qwen 3.7 Max: enable_thinking + reasoning:{effort} + thinking_budget
  | 'thinking_level'      // GLM-5.2: disable_thinking + thinking_level + show_reasoning_content
  | 'thinking_config';    // Gemini 3.1 Pro: thinkingConfig:{thinking_level, include_thoughts, max_thinking_tokens}

interface ThinkingConfig {
  supported: boolean;
  type: ThinkingType;
  canDisable: boolean;        // 是否可关闭思考（Claude Opus 不可彻底关闭）
  /** 始终开启思考（如 kimi-k2.7-code）。影响 configurationSchema 是否提供 'none' 选项 */
  thinkingAlwaysEnabled?: boolean;
  defaultEnabled: boolean;
  paramLocation: 'top_level' | 'extra_body';
  /** 参数定义 */
  params: {
    enable?: string;           // 开启/关闭参数名
    effort?: string;           // 强度参数名
    budget?: string;           // Token预算参数名
    display?: string;          // 思维链展示参数名
    includeReasoning?: string; // 是否包含推理内容
  };
  effortValues?: string[];
  defaultEffort?: string;
  defaultBudget?: number;
  /** 特殊约束 */
  restrictions?: {
    incompatibleParams?: string[];  // 互斥参数
    forceEnable?: boolean;          // 强制开启（Claude Opus）
    useExtraBody?: boolean;         // 是否必须通过 extra_body
  };
}

export const MODEL_REGISTRY: Record<string, ModelCapability> = {
  // ── GPT-5.5: reasoning 嵌套对象 ──
  // 来源: 豆包参考文档 + OpenAI 官方
  'gpt-5.5': {
    contextWindow: 128000, maxOutputTokens: 16384,
    vision: true, toolCalling: true, structuredOutput: true,
    thinking: {
      supported: true, type: 'reasoning_object',
      canDisable: true, defaultEnabled: false,
      paramLocation: 'top_level',
      params: {
        effort: 'reasoning.effort',
        budget: 'reasoning.max_reasoning_tokens',
        includeReasoning: 'reasoning.include_reasoning',
      },
      effortValues: ['none', 'low', 'medium', 'high', 'xhigh'],
      defaultEffort: 'medium',
      defaultBudget: undefined,
    },
  },

  // ── Claude Opus 4.8: thinking 嵌套对象 ──
  // 来源: 豆包参考文档 + Anthropic 官方
  // ⚠️ 强制自适应推理，无法彻底关闭思考
  // ⚠️ 不可自定义 temperature/top_p
  'claude-opus-4-8': {
    contextWindow: 200000, maxOutputTokens: 16384,
    vision: true, toolCalling: true, structuredOutput: false,
    thinking: {
      supported: true, type: 'thinking_object',
      canDisable: false,  // ⚠️ 不可彻底关闭
      thinkingAlwaysEnabled: true,  // configurationSchema 不提供 'none'
      defaultEnabled: true,
      paramLocation: 'top_level',
      params: {
        enable: 'thinking.enabled',
        effort: 'thinking.effort',
        display: 'thinking.display',
      },
      effortValues: ['low', 'medium', 'high', 'max'],
      defaultEffort: 'high',
      restrictions: {
        incompatibleParams: ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty'],
        forceEnable: true,
      },
    },
  },

  // ── Gemini 3.1 Pro Preview: thinkingConfig 对象 ──
  // 来源: 豆包参考文档 + Google 官方
  'gemini-3.1-pro-preview': {
    contextWindow: 1048576, maxOutputTokens: 65536,
    vision: true, toolCalling: true, structuredOutput: false,
    thinking: {
      supported: true, type: 'thinking_config',
      canDisable: true,  // low ≈ 关闭
      defaultEnabled: true,
      paramLocation: 'top_level',
      params: {
        effort: 'thinkingConfig.thinking_level',
        budget: 'thinkingConfig.max_thinking_tokens',
        includeReasoning: 'thinkingConfig.include_thoughts',
      },
      effortValues: ['low', 'medium', 'high'],
      defaultEffort: 'high',
      defaultBudget: undefined,
    },
  },

  // ── DeepSeek V4 Pro: thinking.type ──
  // 来源: 豆包参考文档 + DeepSeek 官方
  // ⚠️ 默认关闭思考！
  // ⚠️ 思考模式下 temperature/top_p 无效
  'deepseek-v4-pro': {
    contextWindow: 1048576, maxOutputTokens: 384000,
    vision: false, toolCalling: true, structuredOutput: false,
    thinking: {
      supported: true, type: 'thinking_type',
      canDisable: true, defaultEnabled: false,  // ⚠️ 默认关闭！
      paramLocation: 'extra_body',
      params: {
        enable: 'thinking.type',
        includeReasoning: 'thinking.show_reasoning',
      },
      effortValues: ['disabled', 'high', 'max'],
      defaultEffort: 'disabled',
      restrictions: {
        incompatibleParams: ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty'],
        useExtraBody: true,
      },
    },
  },

  // ── Qwen 3.7 Max: enable_thinking + reasoning.effort ──
  // 来源: 豆包参考文档 + 阿里云百炼官方
  // ⚠️ 默认关闭思考！
  'qwen3.7-max': {
    contextWindow: 1048576, maxOutputTokens: 32768,
    vision: true, toolCalling: true, structuredOutput: false,
    thinking: {
      supported: true, type: 'enable_thinking',
      canDisable: true, defaultEnabled: false,  // ⚠️ 默认关闭！
      paramLocation: 'top_level',
      params: {
        enable: 'enable_thinking',
        effort: 'reasoning.effort',
        budget: 'thinking_budget',
      },
      effortValues: ['low', 'medium', 'high'],
      defaultEffort: 'medium',
      defaultBudget: 32768,
    },
    extraParams: ['preserve_thinking'],
  },

  // ── GLM 5.2: thinking_level + disable_thinking ──
  // 来源: 豆包参考文档 + 智谱 AI 官方
  // ⚠️ 可关闭！
  'glm-5.2': {
    contextWindow: 1048576, maxOutputTokens: 32768,
    vision: false, toolCalling: true, structuredOutput: true,
    thinking: {
      supported: true, type: 'thinking_level',
      canDisable: true,  // ⚠️ 可关闭！
      defaultEnabled: true,
      paramLocation: 'top_level',
      params: {
        enable: 'disable_thinking',   // 注意：语义反转
        effort: 'thinking_level',
        includeReasoning: 'show_reasoning_content',
      },
      effortValues: ['high', 'max'],
      defaultEffort: 'high',
    },
  },
};
```

---

## 五、ThinkingModeManager 核心逻辑

```typescript
class ThinkingModeManager {
  /**
   * 根据模型 ID 和用户配置，构建思考相关的 API 参数
   * 基于豆包官方参考文档 (2026-06) 精确参数定义
   */
  buildThinkingParams(modelId: string, userConfig: ModelUserConfig) {
    const cap = MODEL_REGISTRY[modelId];
    if (!cap?.thinking.supported) return { topLevel: {}, extraBody: {} };

    const { thinking: t } = cap;
    const topLevel: Record<string, unknown> = {};
    const extraBody: Record<string, unknown> = {};
    const useExtraBody = t.restrictions?.useExtraBody ?? false;

    const setParam = (key: string | undefined, value: unknown) => {
      if (!key) return;
      if (useExtraBody) {
        // DeepSeek 的 thinking 参数必须在 extra_body 中
        setNestedValue(extraBody, key, value);
      } else {
        setNestedValue(topLevel, key, value);
      }
    };

    switch (t.type) {
      case 'reasoning_object': {
        // GPT-5.5: reasoning:{effort, max_reasoning_tokens, include_reasoning}
        const reasoning: Record<string, unknown> = {};
        const effort = userConfig.reasoningEffort ?? (t.defaultEnabled ? t.defaultEffort : 'none');
        if (effort && effort !== 'none') {
          reasoning['effort'] = effort;
          if (userConfig.maxReasoningTokens) {
            reasoning['max_reasoning_tokens'] = userConfig.maxReasoningTokens;
          }
          if (userConfig.includeReasoning) {
            reasoning['include_reasoning'] = true;
          }
        } else {
          reasoning['effort'] = 'none';  // Instant 极速模式
        }
        topLevel['reasoning'] = reasoning;
        break;
      }

      case 'thinking_object': {
        // Claude Opus 4.8: thinking:{enabled, effort, display}
        // ⚠️ 强制开启，无法彻底关闭
        // 用户选 thinkingEnabled=false 时降级为 effort="low"
        const effort = userConfig.thinkingEnabled === false
          ? 'low'
          : (userConfig.reasoningEffort ?? t.defaultEffort!);
        const thinking: Record<string, unknown> = {
          enabled: true,  // 始终 true，不可关闭
          effort,
        };
        if (userConfig.displayThinking === 'full') {
          thinking['display'] = 'full';
        }
        // 注意：直接设置 topLevel['thinking']，而非通过 setParam 路径
        topLevel['thinking'] = thinking;
        break;
      }

      case 'thinking_config': {
        // Gemini 3.1 Pro: thinkingConfig:{thinking_level, include_thoughts, max_thinking_tokens}
        const thinkingConfig: Record<string, unknown> = {
          thinking_level: userConfig.reasoningEffort ?? t.defaultEffort!,
        };
        if (userConfig.includeReasoning) {
          thinkingConfig['include_thoughts'] = true;
        }
        if (userConfig.maxReasoningTokens) {
          thinkingConfig['max_thinking_tokens'] = userConfig.maxReasoningTokens;
        }
        topLevel['thinkingConfig'] = thinkingConfig;
        break;
      }

      case 'thinking_type': {
        // DeepSeek V4 Pro: thinking:{type, show_reasoning}
        // ⚠️ type 值是 "disabled"/"high"/"max"（不是 enabled/disabled）
        const effort = userConfig.reasoningEffort ?? t.defaultEffort!;
        const thinking: Record<string, unknown> = {
          type: effort,  // "disabled" | "high" | "max"
        };
        if (userConfig.includeReasoning !== false) {
          thinking['show_reasoning'] = true;
        }
        setParam(t.params.enable, thinking);
        break;
      }

      case 'enable_thinking': {
        // Qwen 3.7 Max: enable_thinking + reasoning:{effort} + thinking_budget
        if (userConfig.thinkingEnabled) {
          setParam(t.params.enable, true);
          const reasoning: Record<string, unknown> = {
            effort: userConfig.reasoningEffort ?? t.defaultEffort!,
          };
          topLevel['reasoning'] = reasoning;
          if (userConfig.thinkingBudgetTokens) {
            setParam(t.params.budget, userConfig.thinkingBudgetTokens);
          }
        } else {
          setParam(t.params.enable, false);
        }
        break;
      }

      case 'thinking_level': {
        // GLM 5.2: thinking_level + disable_thinking + show_reasoning_content
        if (userConfig.thinkingEnabled === false) {
          setParam(t.params.enable, true);  // disable_thinking: true
        } else {
          setParam(t.params.effort, userConfig.reasoningEffort ?? t.defaultEffort!);
          if (userConfig.includeReasoning !== false) {
            setParam(t.params.includeReasoning, true);
          }
        }
        break;
      }
    }

    return { topLevel, extraBody };
  }
}

/** 辅助：按路径设置嵌套值 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (!current[key]) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]!] = value;
}
```

---

## 六、思考模式参数映射速查表（豆包参考文档校正版 v2.1）

```
用户配置参数               gpt-5.5                   claude-opus-4-8         deepseek-v4-pro        qwen3.7-max             glm-5.2                  gemini-3.1-pro
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
temperature            temperature              ⚠️忽略(官方限制)       ⚠️忽略(思考时)        temperature             temperature             temperature
topP                   top_p                    ⚠️忽略(官方限制)       ⚠️忽略(思考时)        top_p                   top_p                   top_p
maxTokens              max_tokens               max_tokens              max_tokens             max_tokens              max_tokens              max_tokens

thinkingEnabled        reasoning:{effort:        thinking:{enabled:      thinking:{type:        enable_thinking:        disable_thinking:       thinkingConfig:{
=true                  "medium"/"high"           true,                   "high"/"max"}          true                    false                   thinking_level:
                       /"xhigh"}                effort:"high"/"max"}    (extra_body)            + reasoning:{effort}    + thinking_level:       "high"}
                                                                                                                         "high"/"max"

thinkingEnabled        reasoning:{effort:        thinking:{enabled:      thinking:{type:        enable_thinking:        disable_thinking:       thinkingConfig:{
=false                 "none"}                   true,                   "disabled"}            false                   true                    thinking_level:
                       (Instant模式)             effort:"low"}          (extra_body)                                    (直接关闭)              "low"}
                                                (无法彻底关闭⚠️)

reasoningEffort        reasoning:{effort:        thinking:{effort:       thinking:{type:        reasoning:{effort:      thinking_level:         thinkingConfig:
                       "none"/"low"/             "low"/"medium"/         "disabled"/             "low"/"medium"/         "high"/"max"            thinking_level:
                       "medium"/"high"/          "high"/"max"}          "high"/"max"}           "high"}                                         "low"/"medium"/"high"
                       "xhigh"}

maxReasoningTokens     reasoning:{               —                       —                       —                       —                       thinkingConfig:{
                       max_reasoning_                                                                                                            max_thinking_
                       tokens:16~131072}                                                                                                         tokens:512~98304}

thinkingBudgetTokens   —                         —                       —                       thinking_budget:        —                       —
                                                                                                 100~65536

includeReasoning       reasoning:{               thinking:{              thinking:{              —                       show_reasoning_         thinkingConfig:{
                       include_reasoning:        display:"full"}         show_reasoning:                                 content:true            include_thoughts:
                       true}                                             true}                                                                  true}
```

---

## 七、VS Code 集成方案

### 7.1 插件激活与生命周期

```typescript
// src/extension.ts
export async function activate(context: vscode.ExtensionContext) {
  const configManager = new ConfigManager(context);
  const modelManager = new ModelManager(configManager);
  const thinkingManager = new ThinkingModeManager();
  const tokenCounter = new TokenCounter();

  const chatProvider = new Copilot++ChatProvider(
    context, configManager, modelManager, thinkingManager, tokenCounter
  );

  // 注册 LM Provider — 模型出现在 Copilot Chat 模型选择器
  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider('copilot-plus-plus', chatProvider)
  );

  // 注册命令
  registerCommands(context, { configManager, modelManager, chatProvider });

  // 多窗口 API Key 同步
  context.subscriptions.push(
    context.secrets.onDidChange(e => {
      if (e.key === 'copilot-plus-plus.apiKey') chatProvider.refreshModelPicker();
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('copilot-plus-plus')) chatProvider.refreshModelPicker();
    })
  );

  // 激活 Copilot Chat 确保模型选择器就绪
  try {
    await vscode.extensions.getExtension('github.copilot-chat')?.activate();
  } catch { /* Copilot Chat 未安装则跳过 */ }
  
  chatProvider.refreshModelPicker();
}

export async function deactivate() {
  // provider.dispose() 已在 subscriptions 中
}
```

### 7.2 Copilot++ChatProvider 完整结构

```typescript
class Copilot++ChatProvider implements vscode.LanguageModelChatProvider<Copilot++ModelInfo> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this._onDidChange.event;
  private isActive = true;

  /** 自适应 chars-per-token，通过 EMA 从实际 usage 数据持续校准 */
  private charsPerToken = 4.0;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly configManager: ConfigManager,
    private readonly modelManager: ModelManager,
    private readonly thinkingManager: ThinkingModeManager,
    private readonly tokenCounter: TokenCounter,
  ) {}

  refreshModelPicker(): void { this._onDidChange.fire(); }

  /** 停用前清理模型列表，避免残留僵尸条目 */
  async prepareForDeactivate(): Promise<void> {
    this.isActive = false;
    this._onDidChange.fire();
    try { await vscode.lm.selectChatModels({ vendor: 'copilot-plus-plus' }); } catch {}
  }

  dispose(): void { this._onDidChange.dispose(); }

  async provideLanguageModelChatInformation(
    options: { silent: boolean }, _token: vscode.CancellationToken
  ): Promise<Copilot++ModelInfo[]> {
    if (!this.isActive) return [];
    if (options.silent) return [];

    const hasKey = await this.configManager.hasApiKey();
    const models = await this.modelManager.getModels();

    return models
      .filter(m => m.type === 'text')
      .map(m => this.toVSCodeModelInfo(m, hasKey));
  }

  // provideLanguageModelChatResponse + provideTokenCount 同前设计
}
```

### 7.3 configurationSchema — 思考参数原生 UI

```typescript
// 模型信息注入 configurationSchema，用户在模型选择器中直接配置思考强度
function toVSCodeModelInfo(m: ApiModelInfo, hasKey: boolean): Copilot++ModelInfo {
  const capability = MODEL_REGISTRY[m.id];
  const thinkingConfig = capability?.thinking;

  return {
    id: m.id, name: toDisplayName(m.id),
    vendor: 'copilot-plus-plus', family: inferFamily(m.id), version: '1.0.0',
    maxInputTokens: capability?.contextWindow ?? 128000,
    maxOutputTokens: capability?.maxOutputTokens ?? 4096,
    detail: hasKey ? buildDetail(capability) : '请先设置 API Key',
    statusIcon: hasKey ? undefined : new vscode.ThemeIcon('warning'),
    isUserSelectable: true,
    capabilities: {
      toolCalling: capability?.toolCalling ?? false,
      imageInput: capability?.vision ?? false,
    },
    // 思考强度原生配置 UI
    ...(thinkingConfig?.supported
      ? { configurationSchema: buildThinkingSchema(thinkingConfig) }
      : {}),
  };
}

function buildThinkingSchema(t: ThinkingConfig) {
  const alwaysEnabled = !t.canDisable;
  const values = alwaysEnabled
    ? (t.effortValues ?? []).filter(v => v !== 'none' && v !== 'disabled')
    : (t.effortValues ?? []);

  return {
    properties: {
      reasoningEffort: {
        type: 'string',
        title: '思考强度',
        enum: values,
        enumItemLabels: values.map(v => {
          const labels: Record<string, string> = {
            none:'Instant', low:'低', medium:'中', high:'高', xhigh:'超高', max:'极限', disabled:'关闭'
          };
          return labels[v] ?? v;
        }),
        default: t.defaultEffort,
        group: 'navigation',
      },
    },
  };
}
```

**双通道优先级**：模型选择器配置 > `modelOverrides` settings > 注册表默认值

### 7.4 命令列表

| 命令 ID | 标题 |
|---------|------|
| `copilot-plus-plus.setApiKey` | 设置 API Key |
| `copilot-plus-plus.refreshModels` | 刷新模型列表 |
| `copilot-plus-plus.selectModel` | 选择默认模型 |
| `copilot-plus-plus.generateImage` | 生成图像 |
| `copilot-plus-plus.openModelConfig` | 模型参数配置 |

---

## 八、开发阶段规划

### Phase 1: 基础框架 (Week 1-2)

- 项目脚手架、API Client、ChatProvider 基本实现
- **里程碑**: `gpt-5.5` 在 VS Code Chat 中正常对话

### Phase 2: 全模型 + 思考模式 (Week 3-4)

- modelRegistry、ThinkingModeManager、6 文本模型接入
- 思考内容流式展示 (`LanguageModelThinkingPart`)
- **里程碑**: 全部 6 个文本模型可用，思考模式可配置

### Phase 3: 图像模型 (Week 5-6)

- ImageGenerator、Webview 图像面板
- Chat 内 Tool Calling 联动生图
- **里程碑**: 全部 2 个图像模型可用

### Phase 4: 体验优化与发布 (Week 7-8)

- 可视化参数配置 Webview、测试 (≥80% 覆盖率)、VSIX 打包

---

## 九、关键技术注意事项（豆包参考文档校正版）

### 9.1 GPT-5.5
- 使用 `reasoning` **嵌套对象**（非 `reasoning_effort` 字符串）
- `effort: "none"` = Instant 极速模式（无思考，最快，最低成本）
- `effort: "xhigh"` = 超高档位（Token 消耗提升 ≥100%）
- 思维链 Token 计入输出计费，占用上下文窗口

### 9.2 Claude Opus 4.8
- **强制自适应推理**：`thinking.enabled` 始终为 `true`，无法彻底关闭
- 仅可通过 `thinking.effort: "low"` 降低推理深度
- **不可自定义 `temperature`/`top_p`**（官方限制）
- 支持顶层简写 `"effort": "max"`，等价于 `thinking.effort`

### 9.3 DeepSeek V4 Pro
- ⚠️ **默认关闭思考**（`thinking.type` 默认 `"disabled"`）
- `type` 值为 `"disabled"` / `"high"` / `"max"`（不是 enabled/disabled）
- 思考模式下 `temperature`/`top_p` 无效，需自动剥离
- 参数必须通过 `extra_body` 传入（OpenAI SDK 兼容）
- 兼容顶层 `reasoning_effort` 简写

### 9.4 Qwen 3.7 Max
- ⚠️ **默认关闭思考**（`enable_thinking` 默认 `false`）
- 使用 `reasoning: {effort}` 嵌套对象（不是 `reasoning_effort` 字符串）
- `thinking_budget` 默认 32768，范围 100~65536
- `preserve_thinking` 支持多轮对话思维链上下文传递

### 9.5 GLM 5.2
- 使用 `disable_thinking` 关闭（语义反转，true=关闭）
- 使用 `thinking_level` 控制档位（`"high"` / `"max"`），非 `enable_thinking` + `thinking_budget`
- 实际模型 ID: `zai-org/GLM-5.2-FP8`（网关透明路由）
- ⚠️ **可关闭思考**（非之前假设的"始终思考"）

### 9.6 Gemini 3.1 Pro Preview
- 使用 `thinkingConfig` **顶层对象**
- `thinking_level: "low"` ≈ 关闭深度思考
- `include_thoughts` 控制是否返回推理文本（默认 `false`）
- `max_thinking_tokens` 范围 512~98304

### 9.7 通用计费与性能规则（来源：豆包文档）

| 规则 | 说明 |
|------|------|
| **计费** | 所有模型思维链 Token 计入输出计费，高档位推理提升 30%~200% Token 消耗 |
| **上下文** | 思考 Token 占用上下文窗口额度，长文本建议限制 `max_reasoning_tokens` |
| **延迟** | `max`/`xhigh` 档位显著增加响应延迟，高频场景建议 `medium`/`high` |
| **IDE 兼容** | Continue、Coding Plans、CodeBuddy 等 VS Code 插件完全兼容本文参数 |

### 9.8 不可用模型
- `gpt-5.5-pro` 和 `gemini-3-pro-image-preview-2K` 在列表中存在但无可用渠道
- 插件应标记为 `unavailable`，不展示给用户

---

## 十、补充模块详细设计

### 10.1 SecretStore — API Key 安全存储

```typescript
// src/services/SecretStore.ts

import * as vscode from 'vscode';

const STORAGE_KEY = 'copilot-plus-plus.apiKey';

export class SecretStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  /** 存储 API Key */
  async set(key: string): Promise<void> {
    await this.context.secrets.store(STORAGE_KEY, key);
  }

  /** 获取 API Key */
  async get(): Promise<string | undefined> {
    return this.context.secrets.get(STORAGE_KEY);
  }

  /** 删除 API Key */
  async delete(): Promise<void> {
    await this.context.secrets.delete(STORAGE_KEY);
  }

  /** 监听 Key 变更（用于多窗口同步） */
  onChange(listener: () => void): vscode.Disposable {
    return this.context.secrets.onDidChange(e => {
      if (e.key === STORAGE_KEY) listener();
    });
  }
}
```

### 10.2 错误处理框架

```typescript
// src/api/errors.ts

export enum Copilot++ErrorCode {
  INVALID_API_KEY = 'invalid_api_key',       // 401
  INSUFFICIENT_QUOTA = 'insufficient_user_quota', // 402
  RATE_LIMITED = 'too_many_requests',        // 429
  MODEL_NOT_FOUND = 'model_not_found',       // 400
  NO_CHANNEL = 'no_available_channel',       // 模型无可用渠道
  BAD_RESPONSE = 'bad_response_body',        // 500
  NETWORK_ERROR = 'network_error',           // fetch 失败
  TIMEOUT = 'timeout',                       // 超时
}

export class Copilot++Error extends Error {
  constructor(
    public readonly code: Copilot++ErrorCode,
    message: string,
    public readonly statusCode?: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'Copilot++Error';
  }
}

/** 用户友好的中文错误消息映射 */
export const ERROR_MESSAGES: Record<Copilot++ErrorCode, string> = {
  [Copilot++ErrorCode.INVALID_API_KEY]: 'API Key 无效或已过期，请重新设置。',
  [Copilot++ErrorCode.INSUFFICIENT_QUOTA]: '账户额度不足，请充值后重试。',
  [Copilot++ErrorCode.RATE_LIMITED]: '请求过于频繁，请稍后重试。',
  [Copilot++ErrorCode.MODEL_NOT_FOUND]: '所选模型不可用，请尝试其他模型。',
  [Copilot++ErrorCode.NO_CHANNEL]: '该模型暂无可用渠道，已自动跳过。',
  [Copilot++ErrorCode.BAD_RESPONSE]: '服务响应异常，请稍后重试。',
  [Copilot++ErrorCode.NETWORK_ERROR]: '网络连接失败，请检查网络设置。',
  [Copilot++ErrorCode.TIMEOUT]: '请求超时，请检查网络或增加超时时间。',
};

/** 判断是否应重试 */
export function isRetryable(code: Copilot++ErrorCode): boolean {
  return [Copilot++ErrorCode.RATE_LIMITED, Copilot++ErrorCode.BAD_RESPONSE,
          Copilot++ErrorCode.NETWORK_ERROR, Copilot++ErrorCode.TIMEOUT].includes(code);
}

/** 指数退避重试包装器 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000 } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof Copilot++Error && !isRetryable(err.code)) throw err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}
```

### 10.3 API Model → VS Code ModelInfo 映射

```typescript
// src/models/ModelInfo.ts

import * as vscode from 'vscode';

/** API 返回的原始模型信息 */
export interface ApiModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  supported_endpoint_types?: ('openai' | 'openai-response' | 'image-generation' | 'gemini')[];
}

/** VS Code LM Provider 需要的模型信息（扩展） */
export interface Copilot++ModelInfo extends vscode.LanguageModelChatInformation {
  /** 原始模型 ID */
  modelId: string;
  /** 模型类型 */
  modelType: 'text' | 'image';
  /** 是否实际可用（有渠道） */
  available: boolean;
  /** 思考配置引用 */
  thinkingConfig?: ThinkingConfig;
}

/**
 * 将 API 模型转换为 VS Code LanguageModelChatInformation
 */
export function toVSCodeModelInfo(apiModel: ApiModelInfo): Copilot++ModelInfo {
  const family = inferFamily(apiModel.id);
  const capability = MODEL_REGISTRY[apiModel.id];
  const modelType = apiModel.supported_endpoint_types?.includes('image-generation')
    ? 'image' : 'text';

  return {
    // VS Code 标准字段
    id: apiModel.id,
    name: toDisplayName(apiModel.id, family),
    vendor: 'copilot-plus-plus',
    family,
    version: '1.0.0',
    maxInputTokens: capability?.contextWindow ?? 128000,
    maxOutputTokens: capability?.maxOutputTokens ?? 4096,
    detail: buildDetail(capability),
    capabilities: {
      imageInput: capability?.vision ?? false,
      toolCalling: capability?.toolCalling ?? false,
    },
    // 扩展字段
    modelId: apiModel.id,
    modelType,
    available: true,  // 列表中存在即认为可用，运行时再验证
    thinkingConfig: capability?.thinking,
  };
}

function inferFamily(id: string): string {
  if (id.startsWith('gpt-')) return 'gpt';
  if (id.startsWith('claude-')) return 'claude';
  if (id.startsWith('gemini-')) return 'gemini';
  if (id.startsWith('deepseek-')) return 'deepseek';
  if (id.startsWith('qwen')) return 'qwen';
  if (id.startsWith('glm-')) return 'glm';
  return 'other';
}

function toDisplayName(id: string, family: string): string {
  const displayNames: Record<string, string> = {
    'gpt-5.5': 'GPT-5.5',
    'claude-opus-4-8': 'Claude Opus 4.8',
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
    'deepseek-v4-pro': 'DeepSeek V4 Pro',
    'qwen3.7-max': 'Qwen 3.7 Max',
    'glm-5.2': 'GLM 5.2',
    'gpt-image-2': 'GPT Image 2',
    'gpt-image-2-all': 'GPT Image 2 (All)',
  };
  return displayNames[id] ?? id;
}

function buildDetail(capability?: ModelCapability): string | undefined {
  if (!capability) return undefined;
  const parts: string[] = [];
  parts.push(`${(capability.contextWindow / 1000).toFixed(0)}K 上下文`);
  if (capability.thinking?.supported) {
    parts.push('支持思考');
  }
  if (capability.vision) {
    parts.push('支持视觉');
  }
  return parts.join(' · ');
}
```

### 10.4 ImageGenerator 详细设计

```typescript
// src/services/ImageGenerator.ts

import * as vscode from 'vscode';
import { Copilot++ApiClient } from '../api/Copilot++ApiClient';
import { ConfigManager } from './ConfigManager';

export interface ImageGenRequest {
  model: string;
  prompt: string;
  size?: string;
  n?: number;
  responseFormat?: 'url' | 'b64_json';
  referenceImage?: string;  // base64
}

export interface ImageGenResult {
  url?: string;
  b64Json?: string;
  revisedPrompt?: string;
}

export class ImageGenerator {
  constructor(
    private readonly configManager: ConfigManager,
    private readonly apiClient: Copilot++ApiClient,
  ) {}

  /** 生成图像 */
  async generate(req: ImageGenRequest): Promise<ImageGenResult[]> {
    const imageDefaults = this.configManager.getImageDefaults();
    const body: Record<string, unknown> = {
      model: req.model,
      prompt: req.prompt,
      n: req.n ?? imageDefaults.n ?? 1,
      size: req.size ?? imageDefaults.size ?? '1024x1024',
      response_format: req.responseFormat ?? imageDefaults.responseFormat ?? 'url',
    };

    if (req.referenceImage) {
      body['image'] = [req.referenceImage];
    }

    const result = await this.apiClient.post('/v1/images/generations', body);

    return (result as { data: ImageGenResult[] }).data ?? [];
  }

  /** 显示生成结果：在 VS Code 中打开图片预览 */
  async showResults(results: ImageGenResult[]): Promise<void> {
    for (const [i, result] of results.entries()) {
      if (result.url) {
        // 方案 A：在浏览器中打开
        // await vscode.env.openExternal(vscode.Uri.parse(result.url));

        // 方案 B：在 VS Code 内置浏览器/Webview 中展示
        const panel = vscode.window.createWebviewPanel(
          `copilot-plus-plus-image-${Date.now()}-${i}`,
          `生成结果 ${i + 1}`,
          vscode.ViewColumn.Beside,
          { enableScripts: true },
        );
        panel.webview.html = this.buildImageHtml(result);
      }
    }
  }

  private buildImageHtml(result: ImageGenResult): string {
    const src = result.url ?? `data:image/png;base64,${result.b64Json}`;
    return `<!DOCTYPE html>
<html><body style="margin:0;display:flex;align-items:center;justify-content:center;
background:#1e1e1e;min-height:100vh;">
<img src="${src}" style="max-width:100%;max-height:100vh;" alt="${result.revisedPrompt ?? ''}"/>
</body></html>`;
  }
}
```

### 10.5 模型列表过滤与可用性标记

```typescript
// src/services/ModelManager.ts 核心方法补充

class ModelManager {
  // ...existing methods...

  /**
   * 获取文本模型列表（仅可用的聊天模型）
   */
  async getChatModels(): Promise<Copilot++ModelInfo[]> {
    const models = await this.getModels();
    return models
      .filter(m => {
        // 排除图像生成模型
        const isImageModel = m.supported_endpoint_types?.every(
          t => t === 'image-generation'
        );
        return !isImageModel;
      })
      .map(toVSCodeModelInfo)
      .filter(m => m.available);
  }

  /**
   * 获取图像模型列表
   */
  async getImageModels(): Promise<Copilot++ModelInfo[]> {
    const models = await this.getModels();
    return models
      .filter(m => m.supported_endpoint_types?.includes('image-generation'))
      .map(m => toVSCodeModelInfo(m));
  }

  /**
   * 标记模型为不可用（遇到 "No available channel" 时调用）
   */
  markUnavailable(modelId: string): void {
    const model = this.modelCache.find(m => m.id === modelId);
    if (model) {
      (model as any)._unavailable = true;
    }
  }
}
```

### 10.6 Copilot++ApiClient 完整设计

```typescript
// src/api/Copilot++ApiClient.ts

export class Copilot++ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getApiKey: () => Promise<string | undefined>,
    private readonly timeout: number = 120000,
  ) {}

  /** 通用请求 */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Copilot++Error(Copilot++ErrorCode.INVALID_API_KEY, 'API Key 未设置');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    if (signal) signal.addEventListener('abort', () => controller.abort());

    try {
      const resp = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!resp.ok) {
        await this.handleHttpError(resp);
      }

      return resp.json() as Promise<T>;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Copilot++Error(Copilot++ErrorCode.TIMEOUT, '请求超时');
      }
      if (err instanceof Copilot++Error) throw err;
      throw new Copilot++Error(Copilot++ErrorCode.NETWORK_ERROR, (err as Error).message);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async handleHttpError(resp: Response): Promise<never> {
    let body: { error?: { code?: string; message?: string } } = {};
    try { body = await resp.json(); } catch {}

    const code = body?.error?.code;
    if (resp.status === 401) throw new Copilot++Error(Copilot++ErrorCode.INVALID_API_KEY, body?.error?.message ?? 'Invalid API key', 401);
    if (resp.status === 402) throw new Copilot++Error(Copilot++ErrorCode.INSUFFICIENT_QUOTA, body?.error?.message ?? 'Insufficient quota', 402);
    if (resp.status === 429) throw new Copilot++Error(Copilot++ErrorCode.RATE_LIMITED, body?.error?.message ?? 'Rate limited', 429);
    if (code === 'model_not_found') throw new Copilot++Error(Copilot++ErrorCode.MODEL_NOT_FOUND, body?.error?.message ?? 'Model not found', 400);
    if (resp.status === 500) throw new Copilot++Error(Copilot++ErrorCode.BAD_RESPONSE, body?.error?.message ?? 'Server error', 500);

    throw new Copilot++Error(Copilot++ErrorCode.BAD_RESPONSE, `HTTP ${resp.status}: ${body?.error?.message ?? 'Unknown error'}`, resp.status);
  }

  /** 获取模型列表 */
  async listModels(): Promise<ApiModelInfo[]> {
    const result = await withRetry(() => this.request<{ data: ApiModelInfo[] }>('GET', '/v1/models'));
    return result.data ?? [];
  }

  /** 图像生成 */
  async generateImage(body: unknown): Promise<{ data: ImageGenResult[] }> {
    return this.request('POST', '/v1/images/generations', body);
  }

  /** 流式聊天（返回 ReadableStream 供上层消费） */
  async streamChat(body: unknown, signal?: AbortSignal): Promise<Response> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Copilot++Error(Copilot++ErrorCode.INVALID_API_KEY, 'API Key 未设置');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    if (signal) signal.addEventListener('abort', () => controller.abort());

    const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) await this.handleHttpError(resp);
    return resp;
  }
}
```

### 10.7 首次使用引导流程

```typescript
// 在 extension.ts activate() 中添加

async function ensureApiKey(configManager: ConfigManager): Promise<string> {
  let key = await configManager.getApiKey();
  if (!key) {
    // 弹出输入框
    key = await vscode.window.showInputBox({
      prompt: '请输入Copilot++ (Copilot++) API Key',
      placeHolder: 'sk-...',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length < 10) return 'API Key 格式不正确';
        return null;
      },
    });
    if (key) {
      await configManager.setApiKey(key.trim());
      vscode.window.showInformationMessage('Copilot++ API Key 已保存');
    } else {
      vscode.window.showWarningMessage('未设置 API Key，Copilot++ 模型将不可用。稍后可通过命令面板设置。');
    }
  }
  return key ?? '';
}
```

---

## 十一、测试策略

### 11.1 测试金字塔

```
        ┌─────┐
        │ E2E │  手动验证：VS Code 中实际对话
        ├─────┤
        │集成  │  Mock API → 完整 Provider 流程
        ├─────┤
        │单元  │  纯函数测试
        └─────┘
```

### 11.2 单元测试（vitest）

| 模块 | 测试要点 | 预估用例 |
|------|---------|:------:|
| `ThinkingModeManager.buildThinkingParams()` | 6 种 ThinkingType × 开/关/各档位 | ~20 |
| `toVSCodeModelInfo()` | 8 模型映射结果验证 | ~8 |
| `inferFamily()` | 各前缀推断 | ~10 |
| `setNestedValue()` | 嵌套路径设置 | ~5 |
| `isRetryable()` | 各错误码 | ~5 |
| `ERROR_MESSAGES` | 全覆盖 | ~8 |
| **小计** | | **~56** |

### 11.3 集成测试

| 场景 | 方法 |
|------|------|
| 模型列表获取并过滤 | Mock `GET /v1/models` 返回 |
| 流式聊天完整流程 | Mock SSE 流 |
| 思考参数注入正确性 | 拦截 fetch，检查请求体 |
| 错误响应处理 | Mock 401/402/429 响应 |
| API Key 首次输入流程 | SecretStorage mock |

### 11.4 覆盖率目标

- 单元测试: ≥80%
- 集成测试: 核心流程全覆盖
- E2E: 手动 smoke test (Phase 4)

---

## 十二、各 Phase 详细任务分解

### Phase 1: 基础框架 (Week 1-2)

```
Week 1:
├── [P0] 创建 launch.json 调试配置
├── [P0] 创建 .vscodeignore 打包配置
├── [P0] 实现 SecretStore (src/services/SecretStore.ts)
├── [P0] 实现 Copilot++ApiClient 基础版 (GET /v1/models + POST /v1/chat/completions)
├── [P0] 实现 SSE 流解析器 (src/utils/sseParser.ts)
├── [P0] 实现 errors.ts (Copilot++Error + 错误码映射)
├── [P0] 实现 ConfigManager 基础版 (读取 baseUrl)
│
Week 2:
├── [P0] 实现 ModelManager (获取/缓存模型列表)
├── [P0] 实现 toVSCodeModelInfo() 映射
├── [P0] 实现 Copilot++ChatProvider 最小版 (支持 gpt-5.5 纯文本对话)
├── [P0] 实现 extension.ts activate() + 首次使用引导
├── [P0] 实现 commands.ts (setApiKey / refreshModels / selectModel)
└── [P0] 手工验证：gpt-5.5 在 VS Code Chat 中对话

Phase 1 里程碑: ✅ gpt-5.5 可用，API Key 可设置，模型列表可刷新
```

### Phase 2: 全模型 + 思考模式 (Week 3-4)

```
Week 3:
├── [P0] 创建 modelRegistry.ts (全部 6 文本模型精确注册)
├── [P0] 实现 ThinkingModeManager (6 种 ThinkingType)
├── [P0] ThinkingModeManager 单元测试 (≥20 用例)
├── [P0] 扩展 Copilot++ChatProvider: 思考内容流式展示
│       (LanguageModelThinkingPart + reasoning_content)
│
Week 4:
├── [P0] 逐一验证 6 文本模型：claude-opus-4-8 / gemini-3.1-pro-preview
│       / deepseek-v4-pro / qwen3.7-max / glm-5.2
├── [P0] 各模型思考模式开关验证
├── [P0] 工具调用支持 (Tool Call 拦截 & report)
├── [P1] 模型参数配置 Webview MVP
└── [P1] modelOverrides 配置读取/合并

Phase 2 里程碑: ✅ 全部 6 文本模型可用，思考模式可独立配置
```

### Phase 3: 图像模型 (Week 5-6)

```
Week 5:
├── [P0] 实现 ImageGenerator (POST /v1/images/generations)
├── [P0] 实现图像生成命令 (copilot-plus-plus.generateImage)
├── [P0] 实现图像结果 Webview 预览
├── [P1] 模型列表过滤: 区分文本/图像模型
│
Week 6:
├── [P1] 图像生成 Webview 面板 (prompt 输入 + 参数选择 + 结果显示)
├── [P2] Chat 中 Tool Calling 联动生图
├── [P1] 参考图上传/Base64 编码支持
└── [P1] gpt-image-2-all 验证

Phase 3 里程碑: ✅ 2 个图像模型可用，可视化生成界面
```

### Phase 4: 体验优化与发布 (Week 7-8)

```
Week 7:
├── [P0] 集成测试 (核心流程)
├── [P1] 模型参数配置 Webview 完善
├── [P1] 错误处理完善 (重试/降级/友好提示)
├── [P1] 日志系统
├── [P2] 余额查询对接
│
Week 8:
├── [P0] README.md 用户文档
├── [P0] VSIX 打包测试
├── [P1] E2E 手工 smoke test
└── [P2] VS Code Marketplace 发布准备

Phase 4 里程碑: ✅ VSIX 可发布
```

---

*本设计方案基于真实 API Key 验证和以下文档：*
- [豆包 主流大模型思考模式 API 参数完整手册](https://www.doubao.com/thread/xdbc186d948708b9f856ba726f0282a8a) ⭐ 核心参考
- [Copilot++ API 文档](https://doc.copilot-plus-plus.com/zh)
- [阿里云百炼 文本生成](https://help.aliyun.com/zh/model-studio/text-generation-model/)
- [阿里云百炼 深度思考](https://help.aliyun.com/zh/model-studio/deep-thinking)
- [DeepSeek API 文档](https://api-docs.deepseek.com/)
- [VS Code Extension API](https://code.visualstudio.com/api)
