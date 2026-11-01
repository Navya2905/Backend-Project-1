import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { AnswerRequest, AnswerResult, LlmProvider, LlmProviderError } from './llm.provider';

export class AnthropicLlmProvider extends LlmProvider {
  private readonly logger = new Logger(AnthropicLlmProvider.name);
  // Reads ANTHROPIC_API_KEY (or another configured credential) from the environment.
  private readonly client = new Anthropic({ timeout: 60_000, maxRetries: 2 });

  constructor(readonly model: string) {
    super();
  }

  async answer({ system, prompt }: AnswerRequest): Promise<AnswerResult> {
    let response;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        // If a safety classifier declines, the API retries on Anthropic's recommended
        // fallback model inside the same call instead of failing outright.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        throw new LlmProviderError('The AI service is busy. Please try again in a moment.');
      }
      if (err instanceof Anthropic.APIError) {
        this.logger.error(`Claude API error ${err.status}: ${err.message}`);
        throw new LlmProviderError('The AI service returned an error.');
      }
      throw new LlmProviderError('Could not reach the AI service.');
    }

    if (response.stop_reason === 'refusal') {
      return { text: '', refused: true };
    }
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    return { text, refused: false };
  }
}
