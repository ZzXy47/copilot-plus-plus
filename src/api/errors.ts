/**
 * 多元探索 (DuoYuanX) API 错误处理
 */

export enum DuoYuanXErrorCode {
  INVALID_API_KEY = 'invalid_api_key',           // 401
  INSUFFICIENT_QUOTA = 'insufficient_user_quota', // 402
  RATE_LIMITED = 'too_many_requests',             // 429
  MODEL_NOT_FOUND = 'model_not_found',            // 400
  NO_CHANNEL = 'no_available_channel',            // 模型无可用渠道
  BAD_RESPONSE = 'bad_response_body',             // 500
  NETWORK_ERROR = 'network_error',                // fetch 失败
  TIMEOUT = 'timeout',                            // 超时
}

export class DuoYuanXError extends Error {
  constructor(
    public readonly code: DuoYuanXErrorCode,
    message: string,
    public readonly statusCode?: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'DuoYuanXError';
  }
}

/** 用户友好的中文错误消息映射 */
export const ERROR_MESSAGES: Record<DuoYuanXErrorCode, string> = {
  [DuoYuanXErrorCode.INVALID_API_KEY]: 'API Key 无效或已过期，请重新设置。',
  [DuoYuanXErrorCode.INSUFFICIENT_QUOTA]: '账户额度不足，请充值后重试。',
  [DuoYuanXErrorCode.RATE_LIMITED]: '请求过于频繁，请稍后重试。',
  [DuoYuanXErrorCode.MODEL_NOT_FOUND]: '所选模型不可用，请尝试其他模型。',
  [DuoYuanXErrorCode.NO_CHANNEL]: '该模型暂无可用渠道，已自动跳过。',
  [DuoYuanXErrorCode.BAD_RESPONSE]: '服务响应异常，请稍后重试。',
  [DuoYuanXErrorCode.NETWORK_ERROR]: '网络连接失败，请检查网络设置。',
  [DuoYuanXErrorCode.TIMEOUT]: '请求超时，请检查网络或增加超时时间。',
};

/** 判断是否应重试 */
export function isRetryable(code: DuoYuanXErrorCode): boolean {
  return [
    DuoYuanXErrorCode.RATE_LIMITED,
    DuoYuanXErrorCode.BAD_RESPONSE,
    DuoYuanXErrorCode.NETWORK_ERROR,
    DuoYuanXErrorCode.TIMEOUT,
  ].includes(code);
}

/**
 * 从 HTTP 响应中提取错误信息
 */
export async function extractErrorFromResponse(resp: Response): Promise<DuoYuanXError> {
  let body: { error?: { code?: string; message?: string } } = {};
  let rawText = '';
  try {
    rawText = await resp.text();
    body = JSON.parse(rawText);
  } catch {
    // 无法解析 JSON 响应体
  }

  const errorCode = body?.error?.code;
  const errorMessage = body?.error?.message ?? resp.statusText;

  // 记录完整错误用于调试
  console.error(`[Copilot++] HTTP ${resp.status}: ${errorMessage}`, {
    code: errorCode,
    raw: rawText.substring(0, 500),
  });

  if (resp.status === 401) {
    return new DuoYuanXError(DuoYuanXErrorCode.INVALID_API_KEY, errorMessage, 401, body);
  }
  if (resp.status === 402) {
    return new DuoYuanXError(DuoYuanXErrorCode.INSUFFICIENT_QUOTA, errorMessage, 402, body);
  }
  if (resp.status === 429) {
    return new DuoYuanXError(DuoYuanXErrorCode.RATE_LIMITED, errorMessage, 429, body);
  }
  if (errorCode === 'model_not_found') {
    return new DuoYuanXError(DuoYuanXErrorCode.MODEL_NOT_FOUND, errorMessage, 400, body);
  }
  if (errorCode === 'no_available_channel') {
    return new DuoYuanXError(DuoYuanXErrorCode.NO_CHANNEL, errorMessage, 400, body);
  }
  if (resp.status >= 500) {
    return new DuoYuanXError(DuoYuanXErrorCode.BAD_RESPONSE, errorMessage, resp.status, body);
  }

  return new DuoYuanXError(
    DuoYuanXErrorCode.BAD_RESPONSE,
    `HTTP ${resp.status}: ${errorMessage}`,
    resp.status,
    body
  );
}

/**
 * 从通用 catch 错误创建 DuoYuanXError
 */
export function wrapError(err: unknown): DuoYuanXError {
  if (err instanceof DuoYuanXError) {
    return err;
  }
  const name = (err as Error)?.name;
  if (name === 'AbortError' || name === 'TimeoutError') {
    return new DuoYuanXError(DuoYuanXErrorCode.TIMEOUT, '请求超时');
  }
  if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network'))) {
    return new DuoYuanXError(DuoYuanXErrorCode.NETWORK_ERROR, (err as Error).message);
  }
  return new DuoYuanXError(DuoYuanXErrorCode.NETWORK_ERROR, (err as Error).message ?? '未知错误');
}
