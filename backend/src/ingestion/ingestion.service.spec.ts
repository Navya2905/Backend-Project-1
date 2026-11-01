import { UnrecoverableError } from 'bullmq';
import { EmbeddingProvider } from '../ai/embedding.provider';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { IngestionService } from './ingestion.service';
import * as pdfText from './pdf-text';

jest.mock('./pdf-text');

const extractPages = pdfText.extractPages as jest.MockedFunction<typeof pdfText.extractPages>;

function setup(embed: jest.Mock) {
  const queries: string[] = [];
  const db = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return sql.includes('RETURNING workspace_id') ? [{ workspace_id: 'ws', storage_key: 'ws/doc.pdf' }] : [];
    }),
    transaction: jest.fn(async (work: (q: unknown) => Promise<unknown>) => work(db.query)),
  };
  const storage = { read: jest.fn().mockResolvedValue(Buffer.from('%PDF-')) };
  const embeddings = { model: 'test-model', embed };
  const service = new IngestionService(
    db as unknown as DatabaseService,
    storage as unknown as StorageService,
    embeddings as unknown as EmbeddingProvider,
  );
  const markedFailed = () => queries.some((q) => q.includes("status = 'failed'"));
  const markedReady = () => queries.some((q) => q.includes("status = 'ready'"));
  return { service, markedFailed, markedReady };
}

describe('IngestionService retry behaviour', () => {
  beforeEach(() => {
    extractPages.mockResolvedValue([{ pageNumber: 1, text: 'Employees get 20 days of leave.' }]);
  });

  it('stores chunks and marks the document ready on success', async () => {
    const { service, markedReady, markedFailed } = setup(jest.fn().mockResolvedValue([Array.from({ length: 1024 }, () => 0.1)]));
    await service.process('doc', false);
    expect(markedReady()).toBe(true);
    expect(markedFailed()).toBe(false);
  });

  it('on a temporary error before the last attempt, rethrows so the queue retries, without marking failed', async () => {
    const { service, markedFailed } = setup(jest.fn().mockRejectedValue(new Error('embedding API timeout')));
    await expect(service.process('doc', false)).rejects.toThrow('embedding API timeout');
    expect(markedFailed()).toBe(false);
  });

  it('on a temporary error at the last attempt, marks the document failed', async () => {
    const { service, markedFailed } = setup(jest.fn().mockRejectedValue(new Error('embedding API timeout')));
    await expect(service.process('doc', true)).rejects.toThrow();
    expect(markedFailed()).toBe(true);
  });

  it('on a problem with the file itself, fails immediately and tells the queue not to retry', async () => {
    extractPages.mockResolvedValue([{ pageNumber: 1, text: '' }]);
    const embed = jest.fn();
    const { service, markedFailed } = setup(embed);

    await expect(service.process('doc', false)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(markedFailed()).toBe(true);
    expect(embed).not.toHaveBeenCalled();
  });
});
