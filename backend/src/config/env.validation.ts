// Checks environment variables once at startup, so a missing or malformed
// setting stops the app immediately instead of failing on the first request.

const EMBEDDING_PROVIDERS = ['local', 'voyage', 'openai'] as const;
const LLM_PROVIDERS = ['local', 'anthropic'] as const;

export type EmbeddingProviderName = (typeof EMBEDDING_PROVIDERS)[number];
export type LlmProviderName = (typeof LLM_PROVIDERS)[number];

export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const str = (key: string): string | undefined => {
    const value = env[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  };

  if (!str('DATABASE_URL')) errors.push('DATABASE_URL is required');

  const jwtSecret = str('JWT_SECRET');
  if (!jwtSecret) errors.push('JWT_SECRET is required');
  else if (jwtSecret.length < 32) errors.push('JWT_SECRET must be at least 32 characters');

  const embeddingProvider = str('EMBEDDING_PROVIDER') ?? 'local';
  if (!EMBEDDING_PROVIDERS.includes(embeddingProvider as EmbeddingProviderName)) {
    errors.push(`EMBEDDING_PROVIDER must be one of: ${EMBEDDING_PROVIDERS.join(', ')}`);
  }
  if (embeddingProvider === 'voyage' && !str('VOYAGE_API_KEY')) {
    errors.push('VOYAGE_API_KEY is required when EMBEDDING_PROVIDER=voyage');
  }
  if (embeddingProvider === 'openai' && !str('OPENAI_API_KEY')) {
    errors.push('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai');
  }

  const llmProvider = str('LLM_PROVIDER') ?? 'local';
  if (!LLM_PROVIDERS.includes(llmProvider as LlmProviderName)) {
    errors.push(`LLM_PROVIDER must be one of: ${LLM_PROVIDERS.join(', ')}`);
  }

  for (const key of ['PORT', 'MAX_UPLOAD_MB']) {
    const value = str(key);
    if (value !== undefined && !/^\d+$/.test(value)) errors.push(`${key} must be a whole number`);
  }

  const minSimilarity = str('RETRIEVAL_MIN_SIMILARITY');
  if (minSimilarity !== undefined && !(Number(minSimilarity) >= 0 && Number(minSimilarity) <= 1)) {
    errors.push('RETRIEVAL_MIN_SIMILARITY must be a number between 0 and 1');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    ...env,
    EMBEDDING_PROVIDER: embeddingProvider,
    LLM_PROVIDER: llmProvider,
  };
}
