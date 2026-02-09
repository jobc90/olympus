import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NullEmbeddingProvider,
  OpenAIEmbeddingProvider,
  cosineSimilarity,
  createEmbeddingProvider,
} from '../memory/embeddings.js';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('NullEmbeddingProvider', () => {
  const provider = new NullEmbeddingProvider();

  it('should have name "null"', () => {
    expect(provider.name).toBe('null');
    expect(provider.dimensions).toBe(0);
  });

  it('should return null for embed', async () => {
    expect(await provider.embed('test')).toBeNull();
  });

  it('should return array of nulls for embedBatch', async () => {
    const results = await provider.embedBatch(['a', 'b', 'c']);
    expect(results).toEqual([null, null, null]);
  });
});

describe('OpenAIEmbeddingProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should have name "openai" and 1536 dimensions', () => {
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-test' });
    expect(provider.name).toBe('openai');
    expect(provider.dimensions).toBe(1536);
  });

  it('should return null when apiKey is empty', async () => {
    const provider = new OpenAIEmbeddingProvider({ apiKey: '' });
    expect(await provider.embed('test')).toBeNull();
  });

  it('should return null for empty texts', async () => {
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-test' });
    const results = await provider.embedBatch([]);
    expect(results).toEqual([]);
  });

  it('should call OpenAI embeddings API', async () => {
    const fakeEmbedding = new Array(1536).fill(0.1);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: fakeEmbedding, index: 0 }],
      }),
    });

    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-test' });
    const result = await provider.embed('hello world');

    expect(result).toEqual(fakeEmbedding);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
        }),
      }),
    );
  });

  it('should handle batch embeddings in correct order', async () => {
    const emb1 = new Array(1536).fill(0.1);
    const emb2 = new Array(1536).fill(0.2);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { embedding: emb2, index: 1 }, // reversed order
          { embedding: emb1, index: 0 },
        ],
      }),
    });

    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-test' });
    const results = await provider.embedBatch(['first', 'second']);

    expect(results[0]).toEqual(emb1);
    expect(results[1]).toEqual(emb2);
  });

  it('should use custom API base', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1], index: 0 }],
      }),
    });

    const provider = new OpenAIEmbeddingProvider({
      apiKey: 'sk-test',
      apiBase: 'https://custom.api/v1',
    });
    await provider.embed('test');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://custom.api/v1/embeddings',
      expect.anything(),
    );
  });

  it('should return nulls on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-bad' });
    const results = await provider.embedBatch(['a', 'b']);

    expect(results).toEqual([null, null]);
  });

  it('should return nulls on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-test' });
    expect(await provider.embed('test')).toBeNull();
  });
});

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('should return -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it('should return 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('should return 0 for mismatched dimensions', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('should return 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('should compute similarity correctly', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // dot = 32, |a| = sqrt(14), |b| = sqrt(77)
    const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 5);
  });
});

describe('createEmbeddingProvider', () => {
  it('should create NullProvider when no config', () => {
    const p = createEmbeddingProvider();
    expect(p.name).toBe('null');
  });

  it('should create NullProvider when provider is "off"', () => {
    const p = createEmbeddingProvider({ provider: 'off', apiKey: 'sk-test' });
    expect(p.name).toBe('null');
  });

  it('should create NullProvider when no apiKey', () => {
    const p = createEmbeddingProvider({ provider: 'openai' });
    expect(p.name).toBe('null');
  });

  it('should create OpenAIProvider with valid config', () => {
    const p = createEmbeddingProvider({ provider: 'openai', apiKey: 'sk-test' });
    expect(p.name).toBe('openai');
    expect(p.dimensions).toBe(1536);
  });

  it('should fallback to NullProvider for unknown providers', () => {
    const p = createEmbeddingProvider({ provider: 'unknown', apiKey: 'key' });
    expect(p.name).toBe('null');
  });
});
