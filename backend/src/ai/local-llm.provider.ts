import { AnswerRequest, AnswerResult, LlmProvider } from './llm.provider';

const wordsOf = (text: string) => new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2));

// Offline stand-in for an LLM, for development and tests without an API key.
// It doesn't write anything: it quotes the source sentences that share the most
// words with the question, each with its citation. Switch LLM_PROVIDER to
// "anthropic" for real written answers.
export class LocalLlmProvider extends LlmProvider {
  readonly model = 'local-extractive-v1';

  answer({ question, sources }: AnswerRequest): Promise<AnswerResult> {
    const questionWords = wordsOf(question);

    const scored = sources.flatMap((source) =>
      source.content
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => ({
          sentence: sentence.trim(),
          sourceId: source.id,
          score: [...wordsOf(sentence)].filter((w) => questionWords.has(w)).length,
        })),
    );
    const best = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    const text =
      best.length === 0
        ? "I couldn't find this in your documents."
        : best.map((s) => `${s.sentence} [${s.sourceId}]`).join(' ');
    return Promise.resolve({ text, refused: false });
  }
}
