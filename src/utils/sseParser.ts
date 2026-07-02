/**
 * SSE (Server-Sent Events) 流解析器
 * 解析 OpenAI 兼容的 SSE 流，提取 chat.completion.chunk 事件
 */

import type { ChatCompletionChunk } from '../api/types';

/** SSE 事件 */
export interface SSEEvent {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

/**
 * 将 ReadableStream 转换为异步迭代器，产出 ChatCompletionChunk
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<ChatCompletionChunk, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) return;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // 保留最后一个不完整的行
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);

          // SSE [DONE] 标志
          if (data === '[DONE]') return;

          try {
            const chunk = JSON.parse(data) as ChatCompletionChunk;
            if (chunk.object === 'chat.completion.chunk') {
              yield chunk;
            }
          } catch {
            // 忽略无法解析的行（可能是注释放或格式问题）
          }
        }
      }
    }

    // 处理最后的 buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
        try {
          const chunk = JSON.parse(trimmed.slice(6)) as ChatCompletionChunk;
          if (chunk.object === 'chat.completion.chunk') {
            yield chunk;
          }
        } catch {
          // ignore
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 解析单行 SSE 数据
 */
export function parseSSELine(line: string): SSEEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(':')) {
    // SSE 注释
    return { event: 'comment', data: trimmed.slice(1) };
  }

  const event: SSEEvent = { event: 'message', data: '' };

  const fieldMatch = trimmed.match(/^(event|data|id|retry):\s?(.*)$/);
  if (fieldMatch) {
    const field = fieldMatch[1]!;
    const value = fieldMatch[2]!;
    switch (field) {
      case 'event':
        event.event = value;
        break;
      case 'data':
        event.data = value;
        break;
      case 'id':
        event.id = value;
        break;
      case 'retry':
        event.retry = parseInt(value, 10);
        break;
    }
    return event;
  }

  return null;
}
