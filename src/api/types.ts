/**
 * 多元探索 (DuoYuanX) API 类型定义
 */

/** API 返回的原始模型信息 */
export interface ApiModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  supported_endpoint_types?: ('openai' | 'openai-response' | 'image-generation' | 'gemini')[];
}

/** API 模型列表响应 */
export interface ApiModelsResponse {
  object: 'list';
  data: ApiModelInfo[];
}

/** OpenAI 兼容聊天请求 */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  // 思考参数（按模型不同，顶层或 extra_body 注入）
  reasoning?: Record<string, unknown>;
  thinking?: Record<string, unknown>;
  thinkingConfig?: Record<string, unknown>;
  enable_thinking?: boolean;
  disable_thinking?: boolean;
  thinking_level?: string;
  thinking_budget?: number;
  show_reasoning_content?: boolean;
  preserve_thinking?: boolean;
  extra_body?: Record<string, unknown>;
  // 流式选项
  stream_options?: { include_usage?: boolean };
  // 工具调用
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
}

/** 工具定义 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/** 聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ChatContentPart[];
  name?: string;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** 多模态内容部分 */
export interface ChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;  // data:image/...;base64,... 或 http URL
    detail?: 'auto' | 'low' | 'high';
  };
}

/** 工具调用 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
}

/** SSE 流式响应块 */
export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
    reasoning_content?: string;  // 部分模型的思维链
    tool_calls?: ToolCallDelta[];
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

/** 非流式聊天响应 */
export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    reasoning_content?: string;
    tool_calls?: ToolCall[];
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

/** 图像生成请求 */
export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: 'standard' | 'hd';
  response_format?: 'url' | 'b64_json';
  image?: string[];  // base64 参考图
}

/** 图像生成响应 */
export interface ImageGenerationResponse {
  created: number;
  data: ImageResult[];
}

export interface ImageResult {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}
