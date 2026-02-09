import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NonceManager, DEFAULT_NONCE_CONFIG } from '../auth-nonce.js';

describe('NonceManager', () => {
  let manager: NonceManager;

  beforeEach(() => {
    manager = new NonceManager({ enabled: true });
  });

  it('should generate unique challenges', () => {
    const c1 = manager.generateChallenge();
    const c2 = manager.generateChallenge();

    expect(c1.nonce).toBeTruthy();
    expect(c2.nonce).toBeTruthy();
    expect(c1.nonce).not.toBe(c2.nonce);
    expect(c1.timestamp).toBeGreaterThan(0);
  });

  it('should sign a challenge correctly', () => {
    const challenge = { nonce: 'test-nonce', timestamp: 1000 };
    const sig = NonceManager.sign(challenge, 'my-api-key');

    expect(sig).toBeTruthy();
    expect(sig.length).toBe(64); // hex-encoded SHA-256

    // Deterministic
    const sig2 = NonceManager.sign(challenge, 'my-api-key');
    expect(sig).toBe(sig2);

    // Different key → different signature
    const sig3 = NonceManager.sign(challenge, 'other-key');
    expect(sig).not.toBe(sig3);
  });

  it('should verify a valid response', () => {
    const apiKey = 'test-api-key-123';
    const challenge = manager.generateChallenge();
    const signature = NonceManager.sign(challenge, apiKey);

    const result = manager.verify(
      { nonce: challenge.nonce, timestamp: challenge.timestamp, signature },
      apiKey,
    );

    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should reject duplicate nonce (replay attack)', () => {
    const apiKey = 'test-api-key';
    const challenge = manager.generateChallenge();
    const signature = NonceManager.sign(challenge, apiKey);

    // First use — valid
    const r1 = manager.verify(
      { nonce: challenge.nonce, timestamp: challenge.timestamp, signature },
      apiKey,
    );
    expect(r1.valid).toBe(true);

    // Second use — replay
    const r2 = manager.verify(
      { nonce: challenge.nonce, timestamp: challenge.timestamp, signature },
      apiKey,
    );
    expect(r2.valid).toBe(false);
    expect(r2.reason).toBe('Nonce already used');
  });

  it('should reject expired timestamp', () => {
    const apiKey = 'test-key';
    const oldTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
    const challenge = { nonce: 'expired-nonce', timestamp: oldTimestamp };
    const signature = NonceManager.sign(challenge, apiKey);

    const result = manager.verify(
      { nonce: challenge.nonce, timestamp: challenge.timestamp, signature },
      apiKey,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Nonce expired');
  });

  it('should reject future timestamp', () => {
    const apiKey = 'test-key';
    const futureTimestamp = Date.now() + 60 * 1000; // 1 minute in future
    const challenge = { nonce: 'future-nonce', timestamp: futureTimestamp };
    const signature = NonceManager.sign(challenge, apiKey);

    const result = manager.verify(
      { nonce: challenge.nonce, timestamp: challenge.timestamp, signature },
      apiKey,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Timestamp in future');
  });

  it('should reject wrong API key', () => {
    const challenge = manager.generateChallenge();
    const signature = NonceManager.sign(challenge, 'correct-key');

    const result = manager.verify(
      { nonce: challenge.nonce, timestamp: challenge.timestamp, signature },
      'wrong-key',
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid signature');
  });

  it('should reject tampered signature', () => {
    const apiKey = 'test-key';
    const challenge = manager.generateChallenge();

    // Tamper the signature
    const result = manager.verify(
      { nonce: challenge.nonce, timestamp: challenge.timestamp, signature: 'a'.repeat(64) },
      apiKey,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid signature');
  });

  it('should reject invalid hex in signature', () => {
    const apiKey = 'test-key';
    const challenge = manager.generateChallenge();

    const result = manager.verify(
      { nonce: challenge.nonce, timestamp: challenge.timestamp, signature: 'not-hex' },
      apiKey,
    );

    expect(result.valid).toBe(false);
  });

  it('should track stored nonce count', () => {
    const apiKey = 'test-key';
    expect(manager.storedCount).toBe(0);

    const c = manager.generateChallenge();
    manager.verify(
      { nonce: c.nonce, timestamp: c.timestamp, signature: NonceManager.sign(c, apiKey) },
      apiKey,
    );

    expect(manager.storedCount).toBe(1);
  });

  it('should clear all stored nonces', () => {
    const apiKey = 'test-key';
    const c = manager.generateChallenge();
    manager.verify(
      { nonce: c.nonce, timestamp: c.timestamp, signature: NonceManager.sign(c, apiKey) },
      apiKey,
    );

    manager.clear();
    expect(manager.storedCount).toBe(0);
  });

  it('should cleanup when exceeding maxStored', () => {
    const smallManager = new NonceManager({ enabled: true, maxStored: 4, maxAge: 300_000 });
    const apiKey = 'test-key';

    for (let i = 0; i < 5; i++) {
      const c = smallManager.generateChallenge();
      smallManager.verify(
        { nonce: c.nonce, timestamp: c.timestamp, signature: NonceManager.sign(c, apiKey) },
        apiKey,
      );
    }

    // After cleanup, should have fewer than maxStored
    expect(smallManager.storedCount).toBeLessThanOrEqual(4);
  });

  it('should have default config values', () => {
    expect(DEFAULT_NONCE_CONFIG.maxAge).toBe(5 * 60 * 1000);
    expect(DEFAULT_NONCE_CONFIG.maxStored).toBe(10_000);
    expect(DEFAULT_NONCE_CONFIG.enabled).toBe(false);
  });

  it('should report enabled status', () => {
    const disabled = new NonceManager({ enabled: false });
    expect(disabled.enabled).toBe(false);

    const enabled = new NonceManager({ enabled: true });
    expect(enabled.enabled).toBe(true);
  });
});
