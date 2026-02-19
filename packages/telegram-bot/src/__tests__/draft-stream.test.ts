import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DraftStream, DraftStreamManager } from '../draft-stream.js';

// Mock Telegram API
function createMockTelegram() {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 42 }),
    editMessageText: vi.fn().mockResolvedValue(true),
  };
}

describe('DraftStream', () => {
  let telegram: ReturnType<typeof createMockTelegram>;
  let draft: DraftStream;

  beforeEach(() => {
    telegram = createMockTelegram();
    draft = new DraftStream(telegram as any, 123);
  });

  it('should not send until minCharsBeforeSend threshold', async () => {
    await draft.append('Hi'); // 2 chars, default threshold is 30
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('should send first message when threshold is reached', async () => {
    await draft.append('a'.repeat(35)); // > 30 chars default
    expect(telegram.sendMessage).toHaveBeenCalledOnce();
    expect(telegram.sendMessage.mock.calls[0][0]).toBe(123); // chatId
  });

  it('should include ⏳ indicator during streaming', async () => {
    await draft.append('a'.repeat(35));
    const sentText = telegram.sendMessage.mock.calls[0][1] as string;
    expect(sentText).toContain('⏳');
  });

  it('should not include ⏳ after flush', async () => {
    await draft.append('a'.repeat(35));
    await draft.flush();

    // The last editMessageText call should not have ⏳
    if (telegram.editMessageText.mock.calls.length > 0) {
      const lastCall = telegram.editMessageText.mock.calls[telegram.editMessageText.mock.calls.length - 1];
      const lastText = lastCall[3] as string;
      expect(lastText).not.toContain('⏳');
    }
  });

  it('should flush buffer even if below threshold', async () => {
    await draft.append('Short');
    await draft.flush();
    // Should send the short message on flush
    expect(telegram.sendMessage).toHaveBeenCalledOnce();
  });

  it('should not send empty buffer on flush', async () => {
    await draft.flush();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('should handle overflow (>4096 chars)', async () => {
    // Send initial message
    await draft.append('a'.repeat(50));
    expect(telegram.sendMessage).toHaveBeenCalledOnce();

    // Trigger overflow
    await draft.append('b'.repeat(4100));

    // Should have finalized first message and started new one
    const state = draft.getState();
    expect(state.overflow.length).toBeGreaterThanOrEqual(1);
  });

  it('should ignore appends after completion', async () => {
    await draft.append('a'.repeat(35));
    await draft.flush();

    const sendCountAfterFlush = telegram.sendMessage.mock.calls.length;
    await draft.append('more text');
    expect(telegram.sendMessage.mock.calls.length).toBe(sendCountAfterFlush);
  });

  it('should cancel with error message', async () => {
    await draft.append('a'.repeat(35));
    await draft.cancel('Something went wrong');

    const state = draft.getState();
    expect(state.isComplete).toBe(true);
  });

  it('should fallback to plain text on 400 error', async () => {
    telegram.sendMessage
      .mockRejectedValueOnce(new Error('400 Bad Request'))
      .mockResolvedValueOnce({ message_id: 42 });

    await draft.append('a'.repeat(35));

    // Should have retried with plain text (2 calls total)
    expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
    // Second call should not have parse_mode
    const secondCallExtra = telegram.sendMessage.mock.calls[1][2];
    expect(secondCallExtra).toEqual({});
  });

  it('should return state correctly', () => {
    const state = draft.getState();
    expect(state.chatId).toBe(123);
    expect(state.buffer).toBe('');
    expect(state.isComplete).toBe(false);
    expect(state.overflow).toEqual([]);
  });

  it('should close unclosed code blocks during streaming', async () => {
    const customDraft = new DraftStream(telegram as any, 123, { minCharsBeforeSend: 5 });
    await customDraft.append('```js\nconst x = 1;');

    const sentText = telegram.sendMessage.mock.calls[0][1] as string;
    // Should have closing ``` added for display
    const backtickCount = (sentText.match(/```/g) || []).length;
    expect(backtickCount % 2).toBe(0);
  });
});

describe('DraftStreamManager', () => {
  let telegram: ReturnType<typeof createMockTelegram>;
  let manager: DraftStreamManager;

  beforeEach(() => {
    telegram = createMockTelegram();
    manager = new DraftStreamManager();
  });

  it('should create and retrieve drafts', () => {
    manager.create(telegram as any, 123, 'session-1');
    expect(manager.get('session-1')).toBeDefined();
    expect(manager.size).toBe(1);
  });

  it('should remove existing draft when creating new one', () => {
    manager.create(telegram as any, 123, 'session-1');
    manager.create(telegram as any, 123, 'session-1');
    expect(manager.size).toBe(1);
  });

  it('should route stream chunks to correct draft', async () => {
    manager.create(telegram as any, 123, 'session-1');
    manager.create(telegram as any, 456, 'session-2');

    await manager.handleStreamChunk('session-1', 'a'.repeat(35));
    // Only session-1's telegram should receive the message
    expect(telegram.sendMessage).toHaveBeenCalledOnce();
    expect(telegram.sendMessage.mock.calls[0][0]).toBe(123);
  });

  it('should handle complete and cleanup', async () => {
    manager.create(telegram as any, 123, 'session-1');
    await manager.handleStreamChunk('session-1', 'a'.repeat(35));
    await manager.handleComplete('session-1');

    expect(manager.get('session-1')).toBeUndefined();
    expect(manager.size).toBe(0);
  });

  it('should ignore chunks for unknown sessions', async () => {
    await manager.handleStreamChunk('unknown', 'hello');
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('should remove and cancel draft', () => {
    manager.create(telegram as any, 123, 'session-1');
    manager.remove('session-1');
    expect(manager.get('session-1')).toBeUndefined();
    expect(manager.size).toBe(0);
  });
});
