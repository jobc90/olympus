/**
 * Embedding Provider — vector embeddings for semantic task search.
 *
 * Provides an abstraction layer over embedding APIs (OpenAI, local, etc.)
 * to enable similarity-based task retrieval beyond FTS5 keyword matching.
 */

export interface EmbeddingProvider {
  readonly name: string;
  /** Generate embedding vector for text. Returns null if unavailable. */
  embed(text: string): Promise<number[] | null>;
  /** Batch embed multiple texts for efficiency. */
  embedBatch(texts: string[]): Promise<Array<number[] | null>>;
  /** Embedding dimension (e.g., 1536 for text-embedding-3-small) */
  readonly dimensions: number;
}

/**
 * OpenAI text-embedding-3-small provider.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions = 1536;
  private apiKey: string;
  private model: string;
  private apiBase: string;

  constructor(config: {
    apiKey: string;
    model?: string;
    apiBase?: string;
  }) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'text-embedding-3-small';
    this.apiBase = config.apiBase || 'https://api.openai.com/v1';
  }

  async embed(text: string): Promise<number[] | null> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<Array<number[] | null>> {
    if (!this.apiKey || texts.length === 0) {
      return texts.map(() => null);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      const res = await fetch(`${this.apiBase}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        return texts.map(() => null);
      }

      const data = (await res.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      // Sort by index to maintain order
      const sorted = data.data.sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    } catch {
      return texts.map(() => null);
    }
  }
}

/**
 * No-op embedding provider (when embeddings are disabled).
 */
export class NullEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'null';
  readonly dimensions = 0;

  async embed(_text: string): Promise<null> {
    return null;
  }

  async embedBatch(texts: string[]): Promise<null[]> {
    return texts.map(() => null);
  }
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Create an embedding provider from config.
 */
export function createEmbeddingProvider(config?: {
  provider?: string;
  apiKey?: string;
  model?: string;
  apiBase?: string;
}): EmbeddingProvider {
  if (!config?.provider || config.provider === 'off' || !config.apiKey) {
    return new NullEmbeddingProvider();
  }

  switch (config.provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider({
        apiKey: config.apiKey,
        model: config.model,
        apiBase: config.apiBase,
      });
    default:
      return new NullEmbeddingProvider();
  }
}
