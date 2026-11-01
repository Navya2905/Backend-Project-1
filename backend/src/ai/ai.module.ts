import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingProviderName, LlmProviderName } from '../config/env.validation';
import { AnthropicLlmProvider } from './anthropic-llm.provider';
import { EmbeddingProvider } from './embedding.provider';
import { OpenAiEmbeddingProvider, VoyageEmbeddingProvider } from './http-embedding.providers';
import { LlmProvider } from './llm.provider';
import { LocalEmbeddingProvider } from './local-embedding.provider';
import { LocalLlmProvider } from './local-llm.provider';

// Picks the implementation from configuration. Everything else in the app asks
// for the abstract EmbeddingProvider and doesn't know which one it got.
@Global()
@Module({
  providers: [
    {
      provide: EmbeddingProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmbeddingProvider => {
        switch (config.get<EmbeddingProviderName>('EMBEDDING_PROVIDER')) {
          case 'voyage':
            return new VoyageEmbeddingProvider(
              config.getOrThrow('VOYAGE_API_KEY'),
              config.get('VOYAGE_MODEL') ?? 'voyage-3.5',
            );
          case 'openai':
            return new OpenAiEmbeddingProvider(
              config.getOrThrow('OPENAI_API_KEY'),
              config.get('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small',
            );
          default:
            return new LocalEmbeddingProvider();
        }
      },
    },
    {
      provide: LlmProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider =>
        config.get<LlmProviderName>('LLM_PROVIDER') === 'anthropic'
          ? new AnthropicLlmProvider(config.get('ANTHROPIC_MODEL') ?? 'claude-opus-5-5')
          : new LocalLlmProvider(),
    },
  ],
  exports: [EmbeddingProvider, LlmProvider],
})
export class AiModule {}
