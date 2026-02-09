import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Nonce Handshake — replay attack prevention for WebSocket connections.
 *
 * Protocol:
 * 1. Client connects → server sends challenge { nonce, timestamp }
 * 2. Client signs: HMAC-SHA256(nonce + timestamp, apiKey)
 * 3. Server verifies signature + checks nonce uniqueness + timestamp freshness
 *
 * Protections:
 * - Nonce uniqueness: each nonce can only be used once
 * - Timestamp freshness: reject if older than maxAge (default 5 minutes)
 * - HMAC verification: proves client knows the API key
 * - Timing-safe comparison: prevents timing attacks
 */

export interface NonceChallenge {
  nonce: string;
  timestamp: number;
}

export interface NonceResponse {
  nonce: string;
  timestamp: number;
  signature: string;
}

export interface NonceConfig {
  /** Maximum age of a nonce in milliseconds (default: 5 minutes) */
  maxAge: number;
  /** Maximum stored nonces before cleanup (default: 10000) */
  maxStored: number;
  /** Enable nonce verification (default: false — opt-in) */
  enabled: boolean;
}

export const DEFAULT_NONCE_CONFIG: NonceConfig = {
  maxAge: 5 * 60 * 1000, // 5 minutes
  maxStored: 10_000,
  enabled: false,
};

/**
 * Nonce Manager — generates challenges and verifies responses.
 */
export class NonceManager {
  private usedNonces = new Set<string>();
  private config: NonceConfig;

  constructor(config?: Partial<NonceConfig>) {
    this.config = { ...DEFAULT_NONCE_CONFIG, ...config };
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Generate a new challenge for a connecting client.
   */
  generateChallenge(): NonceChallenge {
    return {
      nonce: randomBytes(32).toString('hex'),
      timestamp: Date.now(),
    };
  }

  /**
   * Sign a challenge (client-side operation).
   */
  static sign(challenge: NonceChallenge, apiKey: string): string {
    const data = `${challenge.nonce}:${challenge.timestamp}`;
    return createHmac('sha256', apiKey).update(data).digest('hex');
  }

  /**
   * Verify a client's response to a challenge.
   *
   * Returns true if:
   * 1. Nonce has not been used before
   * 2. Timestamp is within maxAge
   * 3. HMAC signature is valid
   */
  verify(response: NonceResponse, apiKey: string): { valid: boolean; reason?: string } {
    // Check timestamp freshness
    const age = Date.now() - response.timestamp;
    if (age > this.config.maxAge) {
      return { valid: false, reason: 'Nonce expired' };
    }
    if (age < 0) {
      return { valid: false, reason: 'Timestamp in future' };
    }

    // Check nonce uniqueness (replay prevention)
    if (this.usedNonces.has(response.nonce)) {
      return { valid: false, reason: 'Nonce already used' };
    }

    // Verify HMAC signature
    const expectedSignature = NonceManager.sign(
      { nonce: response.nonce, timestamp: response.timestamp },
      apiKey,
    );

    const sigBuffer = Buffer.from(response.signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return { valid: false, reason: 'Invalid signature' };
    }

    if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, reason: 'Invalid signature' };
    }

    // Mark nonce as used
    this.usedNonces.add(response.nonce);
    this.cleanup();

    return { valid: true };
  }

  /**
   * Cleanup old nonces to prevent memory growth.
   */
  private cleanup(): void {
    if (this.usedNonces.size > this.config.maxStored) {
      // Remove oldest half (Set preserves insertion order)
      const toRemove = Math.floor(this.usedNonces.size / 2);
      let count = 0;
      for (const nonce of this.usedNonces) {
        if (count >= toRemove) break;
        this.usedNonces.delete(nonce);
        count++;
      }
    }
  }

  /**
   * Get the number of stored nonces (for monitoring).
   */
  get storedCount(): number {
    return this.usedNonces.size;
  }

  /**
   * Clear all stored nonces.
   */
  clear(): void {
    this.usedNonces.clear();
  }
}
