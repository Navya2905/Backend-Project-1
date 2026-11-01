import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingProviderError } from '../ai/embedding.provider';
import { LlmProvider, LlmProviderError, PromptSource } from '../ai/llm.provider';
import { RetrievalService } from '../retrieval/retrieval.service';
import { parseCitations } from './citations';
import { buildPrompt, NO_ANSWER, SYSTEM_PROMPT } from './prompt';

export interface Citation {
  id: number;
  documentId: string;
  filename: string;
  pageNumber: number;
  excerpt: string;
}

export interface AskResult {
  answer: string;
  // false when DocuMind couldn't find support for an answer in the documents.
  answered: boolean;
  citations: Citation[];
}

const TOP_K = 6;
const EXCERPT_LENGTH = 300;

// Below this similarity a passage is treated as unrelated. These are starting points,
// not measured values: tune them per embedding model with real questions.
const DEFAULT_MIN_SIMILARITY: Record<string, number> = { local: 0.1, voyage: 0.3, openai: 0.25 };

@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);
  private readonly minSimilarity: number;

  constructor(
    private readonly retrieval: RetrievalService,
    private readonly llm: LlmProvider,
    config: ConfigService,
  ) {
    const configured = config.get<string>('RETRIEVAL_MIN_SIMILARITY');
    this.minSimilarity =
      configured !== undefined
        ? Number(configured)
        : (DEFAULT_MIN_SIMILARITY[config.get<string>('EMBEDDING_PROVIDER') ?? 'local'] ?? 0.25);
  }

  async ask(workspaceId: string, question: string): Promise<AskResult> {
    // 1. Retrieve: the closest passages from this workspace only.
    let passages;
    try {
      passages = await this.retrieval.search(workspaceId, question, TOP_K);
    } catch (err) {
      if (err instanceof EmbeddingProviderError) {
        this.logger.error(`Embedding failed: ${err.message}`);
        throw new ServiceUnavailableException('Search is temporarily unavailable. Please try again.');
      }
      throw err;
    }

    // 2. No passage is close enough: say so instead of letting the model guess.
    const relevant = passages.filter((p) => p.similarity >= this.minSimilarity);
    if (relevant.length === 0) return noAnswer();

    // 3. Generate an answer from the numbered passages only.
    const sources: PromptSource[] = relevant.map((p, i) => ({
      id: i + 1,
      filename: p.filename,
      pageNumber: p.pageNumber,
      content: p.content,
    }));

    let result;
    try {
      result = await this.llm.answer({
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(question, sources),
        question,
        sources,
      });
    } catch (err) {
      if (err instanceof LlmProviderError) throw new ServiceUnavailableException(err.message);
      throw err;
    }
    if (result.refused) {
      return { answer: "This question can't be answered.", answered: false, citations: [] };
    }

    // 4. Keep only citations that point at passages we actually sent.
    const { text, citedIds } = parseCitations(result.text, new Set(sources.map((s) => s.id)));
    if (citedIds.length === 0 || text.startsWith(NO_ANSWER)) return noAnswer();

    return {
      answer: text,
      answered: true,
      citations: citedIds.map((id) => {
        const passage = relevant[id - 1];
        return {
          id,
          documentId: passage.documentId,
          filename: passage.filename,
          pageNumber: passage.pageNumber,
          excerpt: excerpt(passage.content),
        };
      }),
    };
  }
}

function noAnswer(): AskResult {
  return { answer: NO_ANSWER, answered: false, citations: [] };
}

function excerpt(text: string): string {
  return text.length <= EXCERPT_LENGTH ? text : `${text.slice(0, EXCERPT_LENGTH).replace(/\s+\S*$/, '')}…`;
}
