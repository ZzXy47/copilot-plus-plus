/**
 * 消息格式转换：VS Code LanguageModelChatRequestMessage ↔ Copilot++ API ChatMessage
 */

import * as vscode from 'vscode';
import type { ChatMessage, ChatContentPart } from '../api/types';

/**
 * 将 VS Code 聊天请求消息转换为 Copilot++ API 格式
 */
export function convertMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const msg of messages) {
    const converted = convertMessage(msg);
    if (converted) {
      result.push(converted);
    }
  }

  return result;
}

/**
 * 将单条 VS Code 请求消息转换为 API 格式
 */
function convertMessage(msg: vscode.LanguageModelChatRequestMessage): ChatMessage | null {
  const role = mapRole(msg.role);

  // 遍历内容部分进行分类处理
  const textParts: string[] = [];
  const imageParts: ChatContentPart[] = [];
  const thinkingParts: string[] = [];
  const toolCallParts: ChatMessage['tool_calls'] = [];
  let toolCallId: string | undefined;

  for (const part of msg.content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      textParts.push(part.value);
    } else if (part instanceof vscode.LanguageModelDataPart) {
      // 🔧 过滤非图片 DataPart（Copilot Chat 内部 token 如 cache_control/ephemeral）
      if (isValidImageDataPart(part)) {
        imageParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${part.mimeType};base64,${part.data}`,
            detail: 'auto',
          },
        });
      }
      // 跳过非图片 DataPart（cache_control、ephemeral 等内部标记）
    } else if (isLanguageModelThinkingPart(part)) {
      // 🔧 ThinkingPart → reasoning_content（参考 DeepSeek V4 插件）
      const thinkingText = normalizeThinkingValue((part as any).value);
      if (thinkingText) {
        thinkingParts.push(thinkingText);
      }
    } else if (part instanceof vscode.LanguageModelToolCallPart) {
      toolCallParts.push({
        id: part.callId,
        type: 'function',
        function: {
          name: part.name,
          arguments: JSON.stringify(part.input ?? {}),
        },
      });
    } else if (part instanceof vscode.LanguageModelToolResultPart) {
      toolCallId = part.callId;
      // 工具结果的 content 是 ReadonlyArray<LanguageModelTextPart | ...>
      for (const resultPart of part.content) {
        if (resultPart instanceof vscode.LanguageModelTextPart) {
          textParts.push(resultPart.value);
        }
      }
    }
  }

  // 构建内容
  let content: string | ChatContentPart[];
  if (imageParts.length > 0) {
    // 多模态：文本 + 图片
    content = [
      ...textParts.map(t => ({ type: 'text' as const, text: t })),
      ...imageParts,
    ];
  } else {
    content = textParts.join('\n');
  }

  // 工具调用消息 —— role 必须是 'assistant'
  if (toolCallParts.length > 0) {
    const msg: ChatMessage = {
      role: 'assistant',
      content: content || null as unknown as string,
      tool_calls: toolCallParts,
    };
    // 附带上一轮的 reasoning_content（多轮思考回放）
    if (thinkingParts.length > 0) {
      msg.reasoning_content = thinkingParts.join('');
    }
    return msg;
  }

  // 工具结果消息 —— role 必须是 'tool'
  if (toolCallId) {
    return {
      role: 'tool',
      content: content || '',
      tool_call_id: toolCallId,
    };
  }

  const result: ChatMessage = {
    role,
    content: content || '',
    ...(msg.name ? { name: msg.name } : {}),
  };
  // assistant 消息携带 reasoning_content
  if (role === 'assistant' && thinkingParts.length > 0) {
    result.reasoning_content = thinkingParts.join('');
  }
  return result;
}

/**
 * 运行时检测 LanguageModelThinkingPart（@types/vscode 版本差异兼容）
 */
function isLanguageModelThinkingPart(part: unknown): boolean {
  return typeof (vscode as any).LanguageModelThinkingPart === 'function'
    && part instanceof (vscode as any).LanguageModelThinkingPart;
}

/**
 * ThinkingPart.value 可能是 string | ReadonlyArray<string>
 */
function normalizeThinkingValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join('');
  return '';
}

/**
 * 角色映射
 */
function mapRole(role: vscode.LanguageModelChatMessageRole): ChatMessage['role'] {
  // VS Code API uses numeric enum: User = 1, Assistant = 2
  // System role is not part of the enum (handled internally by VS Code)
  if (role === 1) return 'user';
  if (role === 2) return 'assistant';
  return 'user';
}

/**
 * 判断 LanguageModelDataPart 是否为有效图片
 * 过滤 Copilot Chat 内部 token（cache_control、ephemeral 等）
 */
const NON_IMAGE_MIME_PATTERNS = /cache.control|ephemeral|prompt.tsx|application|text|json/i;
const IMAGE_MIME_PATTERN = /^image\//;

function isValidImageDataPart(part: vscode.LanguageModelDataPart): boolean {
  // 必须是 image/* 类型
  if (!IMAGE_MIME_PATTERN.test(part.mimeType)) return false;

  // 排除 Copilot Chat 内部标记
  if (NON_IMAGE_MIME_PATTERNS.test(part.mimeType)) return false;

  // 数据不能为空且不能太短（有效 base64 图片至少几十字节）
  if (!part.data || part.data.length < 20) return false;

  return true;
}

/**
 * 估算消息的字符数
 */
export function estimateMessageChars(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): number {
  let total = 0;
  for (const msg of messages) {
    for (const part of msg.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        total += part.value.length;
      }
    }
  }
  return total;
}
