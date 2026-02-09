import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackChannel } from '../channels/slack.js';
import { DiscordChannel } from '../channels/discord.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('SlackChannel', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should throw on initialize without token', async () => {
    const channel = new SlackChannel({
      token: '',
      defaultChannel: 'C123',
    });

    await expect(channel.initialize()).rejects.toThrow('token not configured');
  });

  it('should verify token on initialize', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const channel = new SlackChannel({
      token: 'xoxb-test',
      defaultChannel: 'C123',
    });

    await channel.initialize();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://slack.com/api/auth.test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer xoxb-test',
        }),
      }),
    );
  });

  it('should throw on invalid token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: 'invalid_auth' }),
    });

    const channel = new SlackChannel({
      token: 'xoxb-bad',
      defaultChannel: 'C123',
    });

    await expect(channel.initialize()).rejects.toThrow('invalid_auth');
  });

  it('should send progress message with blocks', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const channel = new SlackChannel({
      token: 'xoxb-test',
      defaultChannel: 'C123',
    });

    await channel.sendMessage('broadcast', {
      type: 'progress',
      content: 'Building...',
      metadata: { progress: 42 },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://slack.com/api/chat.postMessage',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.channel).toBe('C123');
    expect(body.text).toContain('Building');
  });

  it('should send result message', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const channel = new SlackChannel({
      token: 'xoxb-test',
      defaultChannel: 'C123',
    });

    await channel.sendMessage('user123', {
      type: 'result',
      content: 'Task completed successfully',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.channel).toBe('user123');
    expect(body.text).toContain('Agent Result');
  });

  it('should send error message', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const channel = new SlackChannel({
      token: 'xoxb-test',
      defaultChannel: 'C123',
    });

    await channel.sendMessage('broadcast', {
      type: 'error',
      content: 'Build failed',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain('Agent Error');
  });

  it('should fallback to plain text on blocks error', async () => {
    // First call fails (blocks), second succeeds (plain text)
    mockFetch
      .mockRejectedValueOnce(new Error('blocks error'))
      .mockResolvedValueOnce({ ok: true });

    const channel = new SlackChannel({
      token: 'xoxb-test',
      defaultChannel: 'C123',
    });

    await channel.sendMessage('broadcast', {
      type: 'text',
      content: 'hello',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should handle question type with action buttons', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const channel = new SlackChannel({
      token: 'xoxb-test',
      defaultChannel: 'C123',
    });

    await channel.sendMessage('broadcast', {
      type: 'question',
      content: 'Delete all files?',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.blocks).toBeDefined();
    // Should have actions block with approve/reject buttons
    const actionsBlock = body.blocks.find((b: { type: string }) => b.type === 'actions');
    expect(actionsBlock).toBeDefined();
  });

  it('should cleanup on destroy (no-op)', async () => {
    const channel = new SlackChannel({
      token: 'xoxb-test',
      defaultChannel: 'C123',
    });
    await expect(channel.destroy()).resolves.not.toThrow();
  });
});

describe('DiscordChannel', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should throw on initialize without token', async () => {
    const channel = new DiscordChannel({
      token: '',
      defaultChannelId: '123',
    });

    await expect(channel.initialize()).rejects.toThrow('token not configured');
  });

  it('should verify token on initialize', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const channel = new DiscordChannel({
      token: 'bot-token',
      defaultChannelId: '123',
    });

    await channel.initialize();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/users/@me',
      expect.objectContaining({
        headers: { Authorization: 'Bot bot-token' },
      }),
    );
  });

  it('should throw on invalid token', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const channel = new DiscordChannel({
      token: 'bad-token',
      defaultChannelId: '123',
    });

    await expect(channel.initialize()).rejects.toThrow('auth failed');
  });

  it('should send progress message with embed', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const channel = new DiscordChannel({
      token: 'bot-token',
      defaultChannelId: '123',
    });

    await channel.sendMessage('broadcast', {
      type: 'progress',
      content: 'Analyzing...',
      metadata: { progress: 75 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds).toBeDefined();
    expect(body.embeds[0].title).toContain('Progress');
    expect(body.embeds[0].color).toBe(0x3498db);
  });

  it('should send result message', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const channel = new DiscordChannel({
      token: 'bot-token',
      defaultChannelId: '123',
    });

    await channel.sendMessage('456', {
      type: 'result',
      content: 'Done!',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/456/messages',
      expect.anything(),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds[0].color).toBe(0x2ecc71); // green
  });

  it('should send error message with code block', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const channel = new DiscordChannel({
      token: 'bot-token',
      defaultChannelId: '123',
    });

    await channel.sendMessage('broadcast', {
      type: 'error',
      content: 'TypeError: x is not a function',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds[0].description).toContain('```');
    expect(body.embeds[0].color).toBe(0xe74c3c); // red
  });

  it('should fallback to plain text on embed error', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('embed error'))
      .mockResolvedValueOnce({ ok: true });

    const channel = new DiscordChannel({
      token: 'bot-token',
      defaultChannelId: '123',
    });

    await channel.sendMessage('broadcast', {
      type: 'text',
      content: 'hello',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should cleanup on destroy (no-op)', async () => {
    const channel = new DiscordChannel({
      token: 'bot-token',
      defaultChannelId: '123',
    });
    await expect(channel.destroy()).resolves.not.toThrow();
  });
});
