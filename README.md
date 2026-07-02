# Copilot++ — 通用 AI 模型网关 · Universal AI Model Gateway

[English](#english) | 中文

---

## 中文

**Copilot++** 是一款 VS Code 扩展，将**任何兼容 OpenAI 的 API** 连接到 GitHub Copilot Chat — 支持多供应商、自动模型发现、思维链模式配置和图像生成。

### ✨ 功能特性

- 🔌 **多供应商支持** — 添加无限数量的 API 供应商（OpenAI、DeepSeek、GLM、Qwen、本地部署…），自由切换
- 🔍 **自动发现模型** — 自动从每个供应商的 `/v1/models` 端点获取模型列表
- ⚙️ **可视化配置面板** — Webview 图形界面，按供应商分标签页，下拉选择思维模式，输入上下文/令牌限制
- 🧠 **9 种思维链模式** — `reasoning_object`、`thinking_type`、`thinking_adaptive`、`thinking_enabled`、`enable_thinking`、`thinking_config`、`thinking_level`、`preserve_thinking`、`auto` — 在 UI 中统一为 Low/Medium/High 三档，自动映射各模型原生参数
- 🖼️ **图像生成** — 兼容 DALL·E 的 API，分辨率/质量选项，Webview 预览并保存
- 📊 **令牌用量统计** — 实时状态栏显示 + 向 Copilot Chat 报告用量
- 🛡️ **默认安全** — GLM XML 泄漏过滤、工具调用累积处理、SecretStorage 加密

### 📦 安装

#### 从 VS Code 扩展市场安装

```
code --install-extension zenxiy.copilot-plus-plus
```

#### 手动安装

```bash
code --install-extension copilot-plus-plus-*.vsix
```

### 🚀 快速开始

1. `Cmd+Shift+P` → **Copilot++: Set API Key & URL**
2. 输入 API 地址（如 `https://api.openai.com`）和 API 密钥
3. 重复以上步骤添加更多供应商
4. 打开 Copilot Chat → 从模型下拉菜单中选择
5. 点击齿轮图标 ⚙️ 打开 **Webview 配置面板**

### 🧠 思维链模式

| 模式 | 适用模型 | API 参数 |
|------|---------|----------|
| `reasoning_object` | GPT-5.5/5.4 | `reasoning.effort` |
| `thinking_type` | DeepSeek V4 | `reasoning_effort` |
| `thinking_adaptive` | Claude 4.8 | `thinking.type: "adaptive"` |
| `thinking_enabled` | Claude 4.7 / MiniMax | `thinking.type: "enabled"` |
| `enable_thinking` | Qwen 3.7 | `enable_thinking` |
| `thinking_config` | Gemini 3.1 | `thinkingConfig.thinking_level` |
| `thinking_level` | GLM 5.2 | `thinking_level` |
| `preserve_thinking` | Kimi K2.7 | `preserve_thinking` |

所有模式在 UI 中统一显示为 **Low / Medium / High** 三档推理强度，自动映射为各模型的原生 API 参数值。

### ⚙️ 设置项

| 键 | 说明 |
|-----|------|
| `copilotpp.providers` | 供应商配置映射（自动管理） |
| `copilotpp.models` | 单个模型的能力覆盖配置 |
| `copilotpp.modelOverrides` | 单个模型的参数覆盖（temperature、topP、maxTokens） |
| `copilotpp.modelCacheTTL` | 模型列表缓存存活时间（秒，默认 300） |
| `copilotpp.requestTimeout` | 请求超时时间（毫秒，默认 120000） |

#### 供应商自动检测

| URL 主机名 | 供应商 ID |
|-----------|-----------|
| `api.openai.com` | `openai` |
| `api.deepseek.com` | `deepseek` |
| `open.bigmodel.cn` | `glm` |
| 未知域名 | 从域名提取 |

### 📁 项目结构

```
src/
├── extension.ts              # 入口 + 命令注册
├── provider/ChatProvider.ts  # LanguageModelChatProvider
├── api/
│   ├── ApiClient.ts          # HTTP + SSE 客户端
│   ├── types.ts              # API 类型定义
│   └── errors.ts             # 错误处理
├── services/
│   ├── ConfigManager.ts      # 多供应商配置管理
│   ├── ModelManager.ts       # 按供应商获取模型列表
│   ├── RequestBuilder.ts     # 请求体构造
│   ├── StreamHandler.ts      # SSE → VS Code Parts 转换
│   ├── ThinkingMapper.ts     # 思维模式映射
│   ├── ImageGenerator.ts     # 图像生成
│   ├── SecretStore.ts        # 多密钥 SecretStorage
│   └── StatusBarManager.ts   # 状态栏管理
├── panels/
│   └── ModelManagerPanel.ts  # Webview 配置面板
├── models/
│   ├── ModelInfo.ts          # 模型类型
│   └── settings.ts           # 设置类型
└── utils/
    ├── messageConverter.ts   # 消息转换
    ├── sseParser.ts          # SSE 解析器
    ├── tokenEstimator.ts     # 令牌估算
    └── logger.ts             # 日志记录器
```

### 🔧 开发命令

```bash
npm install       # 安装依赖
npm run watch     # 开发模式监听
npm run build     # 构建
npm run package   # 打包 VSIX
```

### 📄 许可证

MIT

### 📖 设计文档

详见 [DESIGN_PLAN.md](./DESIGN_PLAN.md)

---

## English <a id="english"></a>

**Copilot++** is a VS Code extension that connects **any OpenAI-compatible API** to GitHub Copilot Chat — with multi-provider support, automatic model discovery, thinking-mode configuration, and image generation.

### ✨ Features

- 🔌 **Multi-Provider** — Add unlimited API providers (OpenAI, DeepSeek, GLM, Qwen, local, …) and switch between them
- 🔍 **Auto Discovery** — Models are automatically fetched from each provider's `/v1/models` endpoint
- ⚙️ **Visual Config Panel** — Webview UI with tabs per provider, dropdown selectors for thinking modes, and input fields for context/token limits
- 🧠 **9 Thinking Modes** — `reasoning_object`, `thinking_type`, `thinking_adaptive`, `thinking_enabled`, `enable_thinking`, `thinking_config`, `thinking_level`, `preserve_thinking`, `auto` — effort auto-maps to API values
- 🖼️ **Image Generation** — DALL·E-compatible API, resolution/quality options, Webview preview with save
- 📊 **Token Usage** — Real-time status bar + usage reported to Copilot Chat
- 🛡️ **Safe by Default** — GLM XML leak filtering, tool-call accumulation, SecretStorage encryption

### 📦 Install

#### From VS Code Marketplace

```
code --install-extension zenxiy.copilot-plus-plus
```

#### Manual

```bash
code --install-extension copilot-plus-plus-*.vsix
```

### 🚀 Quick Start

1. `Cmd+Shift+P` → **Copilot++: Set API Key & URL**
2. Enter API URL (e.g. `https://api.openai.com`) and API Key
3. Repeat to add more providers
4. Open Copilot Chat → select a model from the dropdown
5. Click the gear icon ⚙️ to open the **Webview Config Panel**

### 🧠 Thinking Modes

| Mode | Models | API Parameter |
|------|--------|---------------|
| `reasoning_object` | GPT-5.5/5.4 | `reasoning.effort` |
| `thinking_type` | DeepSeek V4 | `reasoning_effort` |
| `thinking_adaptive` | Claude 4.8 | `thinking.type: "adaptive"` |
| `thinking_enabled` | Claude 4.7 / MiniMax | `thinking.type: "enabled"` |
| `enable_thinking` | Qwen 3.7 | `enable_thinking` |
| `thinking_config` | Gemini 3.1 | `thinkingConfig.thinking_level` |
| `thinking_level` | GLM 5.2 | `thinking_level` |
| `preserve_thinking` | Kimi K2.7 | `preserve_thinking` |

All modes expose **Low / Medium / High** effort in the UI, automatically mapped to each model's native API values.

### ⚙️ Settings

| Key | Description |
|-----|-------------|
| `copilotpp.providers` | Provider config map (auto-managed) |
| `copilotpp.models` | Per-model capability overrides |
| `copilotpp.modelOverrides` | Per-model parameter overrides (temperature, topP, maxTokens) |
| `copilotpp.modelCacheTTL` | Model list cache TTL in seconds (default: 300) |
| `copilotpp.requestTimeout` | Request timeout in ms (default: 120000) |

#### Provider auto-detection

| URL Hostname | Vendor ID |
|--------------|-----------|
| `api.openai.com` | `openai` |
| `api.deepseek.com` | `deepseek` |
| `open.bigmodel.cn` | `glm` |
| Unknown domain | Extracted from domain |

### 📁 Project Structure

```
src/
├── extension.ts              # Entry point + commands
├── provider/ChatProvider.ts  # LanguageModelChatProvider
├── api/
│   ├── ApiClient.ts          # HTTP + SSE client
│   ├── types.ts              # API types
│   └── errors.ts             # Error handling
├── services/
│   ├── ConfigManager.ts      # Multi-provider config
│   ├── ModelManager.ts       # Per-vendor model fetch
│   ├── RequestBuilder.ts     # Request body builder
│   ├── StreamHandler.ts      # SSE → VS Code Parts
│   ├── ThinkingMapper.ts     # Thinking mode mapping
│   ├── ImageGenerator.ts     # Image generation
│   ├── SecretStore.ts        # Multi-key SecretStorage
│   └── StatusBarManager.ts   # Status bar
├── panels/
│   └── ModelManagerPanel.ts  # Webview config panel
├── models/
│   ├── ModelInfo.ts          # Model types
│   └── settings.ts           # Settings types
└── utils/
    ├── messageConverter.ts   # Message conversion
    ├── sseParser.ts          # SSE parser
    ├── tokenEstimator.ts     # Token estimation
    └── logger.ts             # Logger
```

### 🔧 Development

```bash
npm install       # Install dependencies
npm run watch     # Watch mode
npm run build     # Build
npm run package   # Package VSIX
```

### 📄 License

MIT

### 📖 Design Docs

See [DESIGN_PLAN.md](./DESIGN_PLAN.md) (Chinese)
