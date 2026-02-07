import { describe, it, expect } from 'vitest';
import { classifyError } from '../error-utils.js';

describe('classifyError', () => {
  it('should classify Telegram API errors with status code', () => {
    const err = Object.assign(new Error('Bad Request'), {
      response: { status_code: 400, description: 'Bad Request' },
    });
    const result = classifyError(err);
    expect(result.category).toBe('telegram_api');
    expect(result.code).toBe(400);
    expect(result.retryable).toBe(false);
  });

  it('should mark 429 as retryable', () => {
    const err = Object.assign(new Error('Too Many Requests'), {
      response: { status_code: 429, description: 'Too Many Requests' },
    });
    const result = classifyError(err);
    expect(result.category).toBe('telegram_api');
    expect(result.code).toBe(429);
    expect(result.retryable).toBe(true);
  });

  it('should mark 500+ as retryable', () => {
    const err = Object.assign(new Error('Internal Server Error'), {
      response: { status_code: 502, description: 'Bad Gateway' },
    });
    const result = classifyError(err);
    expect(result.category).toBe('telegram_api');
    expect(result.code).toBe(502);
    expect(result.retryable).toBe(true);
  });

  it('should mark 401 as non-retryable', () => {
    const err = Object.assign(new Error('Unauthorized'), {
      response: { status_code: 401, description: 'Unauthorized' },
    });
    const result = classifyError(err);
    expect(result.category).toBe('telegram_api');
    expect(result.code).toBe(401);
    expect(result.retryable).toBe(false);
  });

  it('should classify timeout errors', () => {
    const result = classifyError(new Error('Promise timed out after 90000 milliseconds'));
    expect(result.category).toBe('timeout');
    expect(result.retryable).toBe(true);
  });

  it('should classify TimeoutError string', () => {
    const result = classifyError(new Error('TimeoutError: connection failed'));
    expect(result.category).toBe('timeout');
    expect(result.retryable).toBe(true);
  });

  it('should classify network errors', () => {
    const result = classifyError(new Error('connect ECONNREFUSED 127.0.0.1:18790'));
    expect(result.category).toBe('network');
    expect(result.retryable).toBe(true);
  });

  it('should classify ENOTFOUND as network error', () => {
    const result = classifyError(new Error('getaddrinfo ENOTFOUND api.telegram.org'));
    expect(result.category).toBe('network');
    expect(result.retryable).toBe(true);
  });

  it('should classify fetch failures as network error', () => {
    const result = classifyError(new Error('fetch failed'));
    expect(result.category).toBe('network');
    expect(result.retryable).toBe(true);
  });

  it('should classify unknown errors as internal', () => {
    const result = classifyError(new Error('Something unexpected happened'));
    expect(result.category).toBe('internal');
    expect(result.retryable).toBe(false);
  });

  it('should handle non-Error values', () => {
    const result = classifyError('string error');
    expect(result.category).toBe('internal');
    expect(result.message).toBe('string error');
  });

  it('should handle null/undefined', () => {
    const result = classifyError(null);
    expect(result.category).toBe('internal');
  });
});
