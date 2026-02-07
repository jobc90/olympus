/**
 * Smart Digest Module
 * Barrel export for digest functionality
 */

export { digestOutput, formatDigest, classifyLine, redactSecrets, buildDigest, groupIntoBlocks } from './engine.js';
export { DigestSession } from './session.js';
export type { DigestResult, ScoredLine, DigestBlock, DigestConfig, LineCategory } from './types.js';
export { DEFAULT_DIGEST_CONFIG } from './types.js';
export { IMMEDIATE_FLUSH_PATTERNS } from './patterns.js';
