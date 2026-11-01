// Where uploaded files live. Callers depend on this abstract class only, so the
// local-disk implementation can be swapped for S3 without touching them.
export abstract class StorageService {
  abstract save(key: string, data: Buffer): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
}
