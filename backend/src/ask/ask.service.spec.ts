import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnswerRequest, AnswerResult, LlmProvider, LlmProviderError } from '../ai/llm.provider';
import { RetrievalService, RetrievedChunk } from '../retrieval/retrieval.service';
import { AskService } from './ask.service';
import { NO_ANSWER } from './prompt';

const passage = (n: number, similarity: number): RetrievedChunk => ({
  chunkId: `chunk-${n}`,
  documentId: `doc-${n}`,
  filename: `file-${n}.pdf`,
  pageNumber: n * 10,
  content: `Passage ${n} text.`,
  similarity,
});

class FakeLlm extends LlmProvider {
  readonly model = 'fake';
  calls: AnswerRequest[] = [];
  constructor(private readonly reply: AnswerResult | Error) {
    super();
  }
  answer(request: AnswerRequest): Promise<AnswerResult> {
    this.calls.push(request);
    return this.reply instanceof Error ? Promise.reject(this.reply) : Promise.resolve(this.reply);
  }
}

function makeService(passages: RetrievedChunk[], llm: FakeLlm) {
  const retrieval = { search: jest.fn().mockResolvedValue(passages) } as unknown as RetrievalService;
  const config = new ConfigService({ EMBEDDING_PROVIDER: 'local', RETRIEVAL_MIN_SIMILARITY: '0.5' });
  return new AskService(retrieval, llm, config);
}

describe('AskService', () => {
  it('answers "not found" without calling the LLM when no passage is similar enough', async () => {
    const llm = new FakeLlm({ text: 'should not be used [1]', refused: false });
    const result = await makeService([passage(1, 0.2), passage(2, 0.1)], llm).ask('ws', 'q');

    expect(result).toEqual({ answer: NO_ANSWER, answered: false, citations: [] });
    expect(llm.calls).toHaveLength(0);
  });

  it('sends only the passages above the threshold, numbered from 1', async () => {
    const llm = new FakeLlm({ text: 'Answer [1].', refused: false });
    await makeService([passage(1, 0.9), passage(2, 0.3)], llm).ask('ws', 'q');

    expect(llm.calls[0].sources.map((s) => [s.id, s.filename])).toEqual([[1, 'file-1.pdf']]);
  });

  it('maps citations back to the right document and page', async () => {
    const llm = new FakeLlm({ text: 'From the second source [2].', refused: false });
    const result = await makeService([passage(1, 0.9), passage(2, 0.8)], llm).ask('ws', 'q');

    expect(result.answered).toBe(true);
    expect(result.citations).toEqual([
      { id: 2, documentId: 'doc-2', filename: 'file-2.pdf', pageNumber: 20, excerpt: 'Passage 2 text.' },
    ]);
  });

  it('treats an answer whose only citations are invented as unsupported', async () => {
    const llm = new FakeLlm({ text: 'Confident claim [7].', refused: false });
    const result = await makeService([passage(1, 0.9)], llm).ask('ws', 'q');
    expect(result.answered).toBe(false);
  });

  it('passes through the model saying it could not find the answer', async () => {
    const llm = new FakeLlm({ text: NO_ANSWER, refused: false });
    const result = await makeService([passage(1, 0.9)], llm).ask('ws', 'q');
    expect(result).toEqual({ answer: NO_ANSWER, answered: false, citations: [] });
  });

  it('handles a safety refusal without exposing details', async () => {
    const llm = new FakeLlm({ text: '', refused: true });
    const result = await makeService([passage(1, 0.9)], llm).ask('ws', 'q');
    expect(result.answered).toBe(false);
    expect(result.citations).toEqual([]);
  });

  it('turns an AI provider failure into 503 Service Unavailable', async () => {
    const llm = new FakeLlm(new LlmProviderError('The AI service is busy.'));
    await expect(makeService([passage(1, 0.9)], llm).ask('ws', 'q')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
