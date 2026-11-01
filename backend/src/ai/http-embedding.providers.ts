import {
  assertDimensions,
  EMBEDDING_DIMENSIONS,
  EmbeddingKind,
  EmbeddingProvider,
  EmbeddingProviderError,
} from './embedding.provider';

interface EmbeddingsResponse {
  data: { index: number; embedding: number[] }[];
}

const BATCH_SIZE = 64;
const TIMEOUT_MS = 30_000;

// Shared request logic for HTTP embedding APIs that return { data: [{ index, embedding }] }.
abstract class HttpEmbeddingProvider extends EmbeddingProvider {
  protected abstract readonly url: string;
  protected abstract readonly apiKey: string;
  protected abstract body(texts: string[], kind: EmbeddingKind): Record<string, unknown>;

  async embed(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      vectors.push(...(await this.request(batch, kind)));
    }
    return assertDimensions(vectors, texts.length);
  }

  private async request(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(this.body(texts, kind)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new EmbeddingProviderError(`${this.model} request failed: ${(err as Error).message}`);
    }
    if (!response.ok) {
      // Don't include the response body: it can echo request details.
      throw new EmbeddingProviderError(`${this.model} returned HTTP ${response.status}`);
    }
    const json = (await response.json()) as EmbeddingsResponse;
    return [...json.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}

export class VoyageEmbeddingProvider extends HttpEmbeddingProvider {
  protected readonly url = 'https://api.voyageai.com/v1/embeddings';

  constructor(
    protected readonly apiKey: string,
    readonly model: string,
  ) {
    super();
  }

  protected body(texts: string[], kind: EmbeddingKind) {
    return { model: this.model, input: texts, input_type: kind, output_dimension: EMBEDDING_DIMENSIONS };
  }
}

export class OpenAiEmbeddingProvider extends HttpEmbeddingProvider {
  protected readonly url = 'https://api.openai.com/v1/embeddings';

  constructor(
    protected readonly apiKey: string,
    readonly model: string,
  ) {
    super();
  }

  protected body(texts: string[]) {
    return { model: this.model, input: texts, dimensions: EMBEDDING_DIMENSIONS };
  }
}
