import { describe, expect, it } from 'vitest';

interface FetchCallRecord {
  url: string;
  init: RequestInit;
}

type CodexChatResult =
  | { type: 'delegation'; workerName?: string }
  | { type: 'chat'; response: string };

async function submitCodexChat(
  message: string,
  chatId: number,
  gatewayUrl: string,
  apiKey: string,
  fetchFn: (url: string, init: RequestInit) => Promise<Response>,
): Promise<CodexChatResult> {
  const response = await fetchFn(`${gatewayUrl}/api/codex/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ message, chatId, source: 'telegram' }),
    signal: AbortSignal.timeout(1_800_000),
  });

  if (!response.ok) {
    let detail = `Codex chat failed: ${response.status}`;
    try {
      const payload = await response.json() as { error?: string; message?: string };
      detail = payload.message ?? payload.error ?? detail;
    } catch {
      // Keep the status-derived fallback.
    }
    throw new Error(detail);
  }

  const data = await response.json() as { type: string; response?: string; workerName?: string };
  if (data.type === 'delegation') {
    return { type: 'delegation', workerName: data.workerName };
  }

  return { type: 'chat', response: data.response ?? '' };
}

function parseDirectMessage(
  text: string,
  chatId: number,
): { message: string; displayName: string; teamPrompt?: string } {
  const atMatch = text.match(/^@(\S+)\s+(.+)$/s);
  const displayName = atMatch ? atMatch[1] : 'default';
  const message = atMatch ? atMatch[2] : text;
  const teamMatch = message.match(/^team[:\s]\s*(.+)$/is);

  return {
    message,
    displayName,
    teamPrompt: teamMatch?.[1]?.trim(),
  };
}

function formatAge(createdAt: number): string {
  const diff = Date.now() - createdAt;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전 시작`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전 시작`;
  return `${Math.floor(hours / 24)}일 전 시작`;
}

describe('submitCodexChat', () => {
  const GATEWAY = 'http://127.0.0.1:8200';
  const API_KEY = 'test-key';
  const CHAT_ID = 12345;

  it('calls /api/codex/chat with the telegram payload', async () => {
    let captured: FetchCallRecord | null = null;

    const mockFetch = async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ type: 'chat', response: 'ok' }), { status: 200 });
    };

    await submitCodexChat('안녕하세요', CHAT_ID, GATEWAY, API_KEY, mockFetch);

    expect(captured).not.toBeNull();
    expect(captured!.url).toBe('http://127.0.0.1:8200/api/codex/chat');
    expect(captured!.init.method).toBe('POST');
    const body = JSON.parse(captured!.init.body as string);
    expect(body).toEqual({
      message: '안녕하세요',
      chatId: CHAT_ID,
      source: 'telegram',
    });
  });

  it('returns delegation responses 그대로', async () => {
    const mockFetch = async () => new Response(JSON.stringify({
      type: 'delegation',
      workerName: 'olympus-1',
    }), { status: 200 });

    await expect(submitCodexChat('@olympus-1 빌드', CHAT_ID, GATEWAY, API_KEY, mockFetch)).resolves.toEqual({
      type: 'delegation',
      workerName: 'olympus-1',
    });
  });

  it('returns chat responses 그대로', async () => {
    const mockFetch = async () => new Response(JSON.stringify({
      type: 'chat',
      response: '현재 워커 2개가 idle 상태입니다.',
    }), { status: 200 });

    await expect(submitCodexChat('상태 알려줘', CHAT_ID, GATEWAY, API_KEY, mockFetch)).resolves.toEqual({
      type: 'chat',
      response: '현재 워커 2개가 idle 상태입니다.',
    });
  });

  it('prefers API error/message payload when the request fails', async () => {
    const mockFetch = async () => new Response(JSON.stringify({ message: 'Codex adapter mention delegation not available' }), { status: 503 });

    await expect(submitCodexChat('@olympus 빌드', CHAT_ID, GATEWAY, API_KEY, mockFetch)).rejects.toThrow(
      'Codex adapter mention delegation not available',
    );
  });

  it('falls back to status text when error payload is unreadable', async () => {
    const mockFetch = async () => new Response('bad gateway', { status: 502 });

    await expect(submitCodexChat('질문', CHAT_ID, GATEWAY, API_KEY, mockFetch)).rejects.toThrow(
      'Codex chat failed: 502',
    );
  });
});

describe('parseDirectMessage', () => {
  it('extracts worker display name and message body from @mention format', () => {
    expect(parseDirectMessage('@olympus-2 테스트 돌려줘', 123)).toEqual({
      displayName: 'olympus-2',
      message: '테스트 돌려줘',
      teamPrompt: undefined,
    });
  });

  it('detects team mode prompt after stripping the worker mention', () => {
    expect(parseDirectMessage('@olympus team API 엔드포인트 추가', 123)).toEqual({
      displayName: 'olympus',
      message: 'team API 엔드포인트 추가',
      teamPrompt: 'API 엔드포인트 추가',
    });
  });

  it('uses default display name for non-mention text', () => {
    expect(parseDirectMessage('그냥 질문', 123)).toEqual({
      displayName: 'default',
      message: '그냥 질문',
      teamPrompt: undefined,
    });
  });
});

describe('formatAge', () => {
  it('formats recent timestamps in Korean relative style', () => {
    expect(formatAge(Date.now() - 30_000)).toBe('방금 전');
    expect(formatAge(Date.now() - 5 * 60_000)).toBe('5분 전 시작');
    expect(formatAge(Date.now() - 2 * 60 * 60_000)).toBe('2시간 전 시작');
  });
});
