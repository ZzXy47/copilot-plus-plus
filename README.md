# Copilot++ — Universal AI Model Gateway

A VS Code extension that connects **any OpenAI-compatible API** to GitHub Copilot Chat — with multi-provider support, automatic model discovery, thinking-mode configuration, and image generation.

## ✨ Features

- 🔌 **Multi-Provider** — Add unlimited API providers (OpenAI, DeepSeek, GLM, Qwen, local, …) and switch between them
- 🔍 **Auto Discovery** — Models are automatically fetched from each provider's `/v1/models` endpoint
- ⚙️ **Visual Config Panel** — Webview UI with tabs per provider, dropdown selectors for thinking modes, and input fields for context/token limits
- 🧠 **9 Thinking Modes** — `reasoning_object`, `thinking_type`, `thinking_adaptive`, `thinking_enabled`, `enable_thinking`, `thinking_config`, `thinking_level`, `preserve_thinking`, `auto` — effort auto-maps to API values
- 🖼️ **Image Generation** — DALL·E-compatible API, resolution/quality options, Webview preview with save
- 📊 **Token Usage** — Real-time status bar + usage reported to Copilot Chat
- 🛡️ **Safe by Default** — GLM XML leak filtering, tool-call accumulation, SecretStorage encryption

## 📦 Install

### From VS Code Marketplace

```
code --install-extension zenxiy.copilot-plus-plus
```

### Manual

```bash
code --install-extension copilot-plus-plus-*.vsix
```

## 🚀 Quick Start

1. `Cmd+Shift+P` → **Copilot++: Set API Key & URL**
2. Enter API URL (e.g. `https://api.openai.com`) and API Key
3. Repeat to add more providers
4. Open Copilot Chat → select a model from the dropdown
5. Click the gear icon ⚙️ to open the **Webview Config Panel**

## 🧠 Thinking Modes

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

## ⚙️ Settings

| Key | Description |
|-----|-------------|
| `copilotpp.providers` | Provider config map (auto-managed) |
| `copilotpp.models` | Per-model capability overrides |
| `copilotpp.modelOverrides` | Per-model parameter overrides (temperature, topP, maxTokens) |
| `copilotpp.modelCacheTTL` | Model list cache TTL in seconds (default: 300) |
| `copilotpp.requestTimeout` | Request timeout in ms (default: 120000) |

### Provider auto-detection

| URL Hostname | Vendor ID |
|--------------|-----------|
| `api.openai.com` | `openai` |
| `api.deepseek.com` | `deepseek` |
| `open.bigmodel.cn` | `glm` |
| Unknown domain | Extracted from domain |

## 📁 Project Structure

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

## 🔧 Development

```bash
npm install
npm run watch
npm run build
npm run package
```

## 📄 License

MIT
