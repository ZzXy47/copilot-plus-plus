/**
 * Token 估算工具 — 基于 chars-per-token 的自适应估算
 */

import * as vscode from 'vscode';

/** 默认 chars-per-token 比率 */
export const DEFAULT_CHARS_PER_TOKEN = 4.0;

/**
 * 估算消息列表总 token 数
 */
export function estimateMessagesTokens(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  charsPerToken: number,
): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateMessageTokens(msg, charsPerToken);
  }
  return total;
}

/**
 * 估算单条消息 token 数
 */
export function estimateMessageTokens(
  msg: vscode.LanguageModelChatRequestMessage,
  charsPerToken: number,
): number {
  let chars = 0;
  for (const part of msg.content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      chars += part.value.length;
    } else if (part instanceof vscode.LanguageModelToolCallPart) {
      chars += JSON.stringify({ n: part.name, i: part.input }).length;
    } else if (part instanceof vscode.LanguageModelToolResultPart) {
      for (const rp of part.content) {
        if (rp instanceof vscode.LanguageModelTextPart) {
          chars += rp.value.length;
        }
      }
    }
  }
  return Math.ceil(chars / charsPerToken);
}

/**
 * 根据流式响应的实际 token 数更新 chars-per-token
 */
export function updateCharsPerToken(
  charsPerToken: number,
  contentLength: number,
  completionTokens: number,
): number {
  if (completionTokens > 0 && contentLength > 0) {
    return contentLength / completionTokens;
  }
  return charsPerToken;
}
