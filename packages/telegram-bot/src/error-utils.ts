// Error classification for structured logging
export type ErrorCategory = 'telegram_api' | 'timeout' | 'network' | 'internal';

export interface ClassifiedError {
  category: ErrorCategory;
  code?: number;
  message: string;
  retryable: boolean;
}

export function classifyError(err: unknown): ClassifiedError {
  const error = err instanceof Error ? err : new Error(String(err));
  const msg = error.message;

  // Telegram API errors (from Telegraf)
  if ('response' in error && typeof (error as any).response?.status_code === 'number') {
    const code = (error as any).response.status_code as number;
    return {
      category: 'telegram_api',
      code,
      message: msg,
      retryable: code === 429 || code >= 500,
    };
  }

  // Timeout errors
  if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('TimeoutError')) {
    return { category: 'timeout', message: msg, retryable: true };
  }

  // Network errors
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('fetch failed') || msg.includes('network')) {
    return { category: 'network', message: msg, retryable: true };
  }

  return { category: 'internal', message: msg, retryable: false };
}

export function structuredLog(level: 'info' | 'warn' | 'error', component: string, event: string, data: Record<string, unknown> = {}): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    event,
    ...data,
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}
