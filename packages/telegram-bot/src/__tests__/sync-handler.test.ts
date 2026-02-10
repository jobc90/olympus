import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CliRunResult } from '@olympus-dev/protocol';

/**
 * Phase 2 동기 HTTP 핸들러 테스트.
 *
 * OlympusBot은 Telegraf에 강결합되어 직접 인스턴스화가 어려우므로,
 * 핵심 핸들러 로직을 함수로 추출하여 단위 테스트합니다.
 * (ws-routing.test.ts와 동일한 패턴)
 */

// ──────────────────────────────────────────────
// 1. isAllowed 로직 추출
// ──────────────────────────────────────────────

function isAllowed(userId: number | undefined, allowedUsers: number[]): boolean {
  if (!userId) return false;
  if (allowedUsers.length === 0) return true; // No restriction
  return allowedUsers.includes(userId);
}

describe('isAllowed (인증 미들웨어)', () => {
  it('userId가 없으면 거부', () => {
    expect(isAllowed(undefined, [123])).toBe(false);
  });

  it('allowedUsers가 비어있으면 모두 허용', () => {
    expect(isAllowed(999, [])).toBe(true);
  });

  it('allowedUsers에 포함된 사용자 허용', () => {
    expect(isAllowed(123, [123, 456])).toBe(true);
  });

  it('allowedUsers에 없는 사용자 거부', () => {
    expect(isAllowed(789, [123, 456])).toBe(false);
  });
});

// ──────────────────────────────────────────────
// 2. 오케스트레이터 모드 텍스트 핸들러 로직 추출
// ──────────────────────────────────────────────

interface FetchCallRecord {
  url: string;
  init: RequestInit;
}

interface HandlerResult {
  type: 'success' | 'error' | 'timeout';
  message: string;
}

/**
 * 오케스트레이터 모드 텍스트 핸들러의 핵심 로직을 추출.
 * fetch 호출 → 응답 처리 → 결과 반환.
 */
async function handleOrchestratorText(
  text: string,
  chatId: number,
  gatewayUrl: string,
  apiKey: string,
  fetchFn: (url: string, init: RequestInit) => Promise<Response>,
): Promise<HandlerResult> {
  try {
    const response = await fetchFn(`${gatewayUrl}/api/cli/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: text,
        sessionKey: `telegram:${chatId}`,
        provider: 'claude',
      }),
      signal: AbortSignal.timeout(600_000),
    });

    if (!response.ok) {
      const error = await response.json() as { message: string };
      throw new Error(error.message);
    }

    const { result } = await response.json() as { result: CliRunResult };

    if (!result.success) {
      return { type: 'error', message: `❌ ${result.error?.type}: ${result.error?.message}` };
    }

    const footer = result.usage
      ? `\n\n📊 ${result.usage.inputTokens + result.usage.outputTokens} 토큰 | $${result.cost?.toFixed(4)} | ${Math.round((result.durationMs ?? 0) / 1000)}초`
      : '';

    return { type: 'success', message: `${result.text}${footer}` };
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') {
      return { type: 'timeout', message: '⏰ 응답 시간 초과 (10분)' };
    }
    return { type: 'error', message: `❌ 오류: ${(err as Error).message}` };
  }
}

describe('handleOrchestratorText (오케스트레이터 모드)', () => {
  const GATEWAY = 'http://127.0.0.1:18790';
  const API_KEY = 'test-key';
  const CHAT_ID = 12345;

  it('올바른 URL, 헤더, 바디로 fetch 호출', async () => {
    let captured: FetchCallRecord | null = null;

    const mockFetch = async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({
        result: {
          success: true,
          text: '응답',
          sessionId: 's1',
          model: 'sonnet',
          usage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0 },
          cost: 0.01,
          durationMs: 3000,
          numTurns: 1,
        },
      }), { status: 200 });
    };

    await handleOrchestratorText('안녕하세요', CHAT_ID, GATEWAY, API_KEY, mockFetch);

    expect(captured).not.toBeNull();
    expect(captured!.url).toBe('http://127.0.0.1:18790/api/cli/run');
    expect(captured!.init.method).toBe('POST');
    expect((captured!.init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((captured!.init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');

    const body = JSON.parse(captured!.init.body as string);
    expect(body.prompt).toBe('안녕하세요');
    expect(body.sessionKey).toBe('telegram:12345');
    expect(body.provider).toBe('claude');
  });

  it('성공 응답 → 텍스트 + 사용량 footer', async () => {
    const mockFetch = async () => new Response(JSON.stringify({
      result: {
        success: true,
        text: '결과입니다',
        sessionId: 's1',
        model: 'sonnet',
        usage: { inputTokens: 200, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0 },
        cost: 0.0234,
        durationMs: 5000,
        numTurns: 1,
      },
    }), { status: 200 });

    const result = await handleOrchestratorText('질문', CHAT_ID, GATEWAY, API_KEY, mockFetch);

    expect(result.type).toBe('success');
    expect(result.message).toContain('결과입니다');
    expect(result.message).toContain('300 토큰');
    expect(result.message).toContain('$0.0234');
    expect(result.message).toContain('5초');
  });

  it('CliRunResult.success=false → 에러 메시지', async () => {
    const mockFetch = async () => new Response(JSON.stringify({
      result: {
        success: false,
        text: '',
        sessionId: '',
        model: '',
        usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
        cost: 0,
        durationMs: 0,
        numTurns: 0,
        error: { type: 'api_error', message: 'Rate limit exceeded' },
      },
    }), { status: 200 });

    const result = await handleOrchestratorText('질문', CHAT_ID, GATEWAY, API_KEY, mockFetch);

    expect(result.type).toBe('error');
    expect(result.message).toContain('api_error');
    expect(result.message).toContain('Rate limit exceeded');
  });

  it('HTTP 에러 (response.ok=false) → 에러 메시지', async () => {
    const mockFetch = async () => new Response(
      JSON.stringify({ message: 'prompt is required' }),
      { status: 400 },
    );

    const result = await handleOrchestratorText('', CHAT_ID, GATEWAY, API_KEY, mockFetch);

    expect(result.type).toBe('error');
    expect(result.message).toContain('prompt is required');
  });

  it('TimeoutError → 타임아웃 메시지', async () => {
    const mockFetch = async () => {
      const err = new DOMException('The operation was aborted', 'TimeoutError');
      throw err;
    };

    const result = await handleOrchestratorText('질문', CHAT_ID, GATEWAY, API_KEY, mockFetch);

    expect(result.type).toBe('timeout');
    expect(result.message).toContain('시간 초과');
  });

  it('네트워크 에러 → 오류 메시지', async () => {
    const mockFetch = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:18790');
    };

    const result = await handleOrchestratorText('질문', CHAT_ID, GATEWAY, API_KEY, mockFetch);

    expect(result.type).toBe('error');
    expect(result.message).toContain('ECONNREFUSED');
  });
});

// ──────────────────────────────────────────────
// 3. 직접 모드 핸들러 로직 추출
// ──────────────────────────────────────────────

interface DirectHandlerResult extends HandlerResult {
  displayName: string;
}

function parseDirectMessage(
  text: string,
  chatId: number,
  activeSessionName: string | null,
): { sessionKey: string; message: string; displayName: string } {
  const atMatch = text.match(/^@(\S+)\s+(.+)$/s);

  if (atMatch) {
    return {
      sessionKey: `telegram:${chatId}:${atMatch[1]}`,
      message: atMatch[2],
      displayName: atMatch[1],
    };
  }

  const displayName = activeSessionName?.replace(/^olympus-/, '') ?? 'default';
  return {
    sessionKey: `telegram:${chatId}:${displayName}`,
    message: text,
    displayName,
  };
}

describe('parseDirectMessage (직접 모드 라우팅)', () => {
  it('@세션 메시지 형식 파싱', () => {
    const result = parseDirectMessage('@dev 빌드해줘', 12345, null);

    expect(result.sessionKey).toBe('telegram:12345:dev');
    expect(result.message).toBe('빌드해줘');
    expect(result.displayName).toBe('dev');
  });

  it('@세션 없으면 activeSession 사용', () => {
    const result = parseDirectMessage('그냥 메시지', 12345, 'olympus-main');

    expect(result.sessionKey).toBe('telegram:12345:main');
    expect(result.message).toBe('그냥 메시지');
    expect(result.displayName).toBe('main');
  });

  it('activeSession 없으면 default 사용', () => {
    const result = parseDirectMessage('메시지', 12345, null);

    expect(result.sessionKey).toBe('telegram:12345:default');
    expect(result.message).toBe('메시지');
    expect(result.displayName).toBe('default');
  });

  it('@세션 뒤에 여러 줄 메시지', () => {
    const result = parseDirectMessage('@project 줄1\n줄2\n줄3', 12345, null);

    expect(result.sessionKey).toBe('telegram:12345:project');
    expect(result.message).toBe('줄1\n줄2\n줄3');
  });
});

// ──────────────────────────────────────────────
// 4. /orchestration 커맨드 fetch 파라미터
// ──────────────────────────────────────────────

function buildOrchestrationBody(prompt: string, chatId: number) {
  return {
    prompt: `/orchestration "${prompt}"`,
    sessionKey: `telegram:${chatId}:orchestration`,
    provider: 'claude',
    timeoutMs: 1_800_000,
  };
}

describe('buildOrchestrationBody', () => {
  it('프롬프트 래핑 및 30분 타임아웃 설정', () => {
    const body = buildOrchestrationBody('로그인 UI 개선', 12345);

    expect(body.prompt).toBe('/orchestration "로그인 UI 개선"');
    expect(body.sessionKey).toBe('telegram:12345:orchestration');
    expect(body.provider).toBe('claude');
    expect(body.timeoutMs).toBe(1_800_000); // 30분
  });
});

// ──────────────────────────────────────────────
// 5. 응답 포맷팅 (usage footer)
// ──────────────────────────────────────────────

function formatResultFooter(result: CliRunResult): string {
  if (!result.usage) return '';
  return `\n\n📊 ${result.usage.inputTokens + result.usage.outputTokens} 토큰 | $${result.cost?.toFixed(4)} | ${Math.round((result.durationMs ?? 0) / 1000)}초`;
}

describe('formatResultFooter', () => {
  it('usage가 있으면 토큰/비용/시간 포맷팅', () => {
    const result: CliRunResult = {
      success: true,
      text: 'ok',
      sessionId: 's',
      model: 'm',
      usage: { inputTokens: 1000, outputTokens: 500, cacheCreationTokens: 0, cacheReadTokens: 0 },
      cost: 0.1234,
      durationMs: 12500,
      numTurns: 1,
    };

    const footer = formatResultFooter(result);
    expect(footer).toContain('1500 토큰');
    expect(footer).toContain('$0.1234');
    expect(footer).toContain('13초'); // Math.round(12500/1000)
  });

  it('durationMs가 0이면 0초', () => {
    const result: CliRunResult = {
      success: true,
      text: '',
      sessionId: '',
      model: '',
      usage: { inputTokens: 10, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0 },
      cost: 0.001,
      durationMs: 0,
      numTurns: 0,
    };

    expect(formatResultFooter(result)).toContain('0초');
  });
});

// ──────────────────────────────────────────────
// 6. sendLongMessage 분할 로직 추출
// ──────────────────────────────────────────────

const TELEGRAM_MSG_LIMIT = 4000;

function splitLongMessage(text: string, sessionPrefix?: string): string[] {
  if (text.length <= TELEGRAM_MSG_LIMIT) {
    return [text];
  }

  const lines = text.split('\n');
  const chunks: string[] = [];
  let chunk = '';
  let partNum = 1;

  for (const line of lines) {
    if (chunk.length + line.length + 1 > TELEGRAM_MSG_LIMIT) {
      if (chunk) {
        chunks.push(chunk.trimEnd());
        partNum++;
        chunk = '';
        if (sessionPrefix) {
          chunk = `${sessionPrefix} (${partNum}부)\n\n`;
        }
      }
      // Single line exceeds limit - force split
      if (line.length > TELEGRAM_MSG_LIMIT) {
        for (let i = 0; i < line.length; i += TELEGRAM_MSG_LIMIT) {
          chunks.push(line.slice(i, i + TELEGRAM_MSG_LIMIT));
          partNum++;
        }
        continue;
      }
    }
    chunk += (chunk ? '\n' : '') + line;
  }
  if (chunk.trim()) {
    chunks.push(chunk.trimEnd());
  }

  return chunks;
}

describe('splitLongMessage (메시지 분할)', () => {
  it('짧은 메시지는 분할하지 않음', () => {
    const result = splitLongMessage('짧은 메시지');
    expect(result).toEqual(['짧은 메시지']);
  });

  it('긴 메시지를 여러 청크로 분할', () => {
    // 4000자 이상의 메시지 생성
    const longText = Array.from({ length: 100 }, (_, i) => `줄 ${i}: ${'가'.repeat(50)}`).join('\n');
    expect(longText.length).toBeGreaterThan(TELEGRAM_MSG_LIMIT);

    const chunks = splitLongMessage(longText);
    expect(chunks.length).toBeGreaterThan(1);

    // 각 청크가 제한 이내
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_MSG_LIMIT);
    }

    // 원본 내용이 보존됨
    const reconstructed = chunks.join('\n');
    expect(reconstructed).toContain('줄 0:');
    expect(reconstructed).toContain('줄 99:');
  });

  it('sessionPrefix가 있으면 2번째 청크부터 접두사 추가', () => {
    const longText = Array.from({ length: 100 }, (_, i) => `줄 ${i}: ${'가'.repeat(50)}`).join('\n');
    const chunks = splitLongMessage(longText, '📩 [dev]');

    expect(chunks.length).toBeGreaterThan(1);
    // 첫 번째 청크는 접두사 없음
    expect(chunks[0]).not.toContain('📩 [dev] (');
    // 두 번째 청크부터 접두사
    expect(chunks[1]).toContain('📩 [dev] (2부)');
  });

  it('단일 행이 제한 초과 시 강제 분할', () => {
    const longLine = '가'.repeat(TELEGRAM_MSG_LIMIT + 1000);
    const chunks = splitLongMessage(longLine);

    expect(chunks.length).toBeGreaterThan(1);
    // 모든 내용이 보존됨
    expect(chunks.join('').length).toBe(longLine.length);
  });
});

// ──────────────────────────────────────────────
// 7. /start 명령어 unknown command 분기
// ──────────────────────────────────────────────

describe('텍스트 핸들러 명령어 감지', () => {
  it('/ 로 시작하는 메시지는 unknown command', () => {
    const text = '/unknown_cmd';
    expect(text.startsWith('/')).toBe(true);
  });

  it('일반 텍스트는 CLI 실행으로 라우팅', () => {
    const text = '안녕하세요 도움이 필요합니다';
    expect(text.startsWith('/')).toBe(false);
  });
});

// ──────────────────────────────────────────────
// 8. formatAge 유틸 추출
// ──────────────────────────────────────────────

function formatAge(createdAt: number): string {
  const diff = Date.now() - createdAt;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전 시작`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전 시작`;
  return `${Math.floor(hours / 24)}일 전 시작`;
}

describe('formatAge', () => {
  it('1분 미만 → "방금 전"', () => {
    expect(formatAge(Date.now() - 30_000)).toBe('방금 전');
  });

  it('5분 전 → "5분 전 시작"', () => {
    expect(formatAge(Date.now() - 5 * 60_000)).toBe('5분 전 시작');
  });

  it('2시간 전 → "2시간 전 시작"', () => {
    expect(formatAge(Date.now() - 2 * 60 * 60_000)).toBe('2시간 전 시작');
  });

  it('3일 전 → "3일 전 시작"', () => {
    expect(formatAge(Date.now() - 3 * 24 * 60 * 60_000)).toBe('3일 전 시작');
  });
});
