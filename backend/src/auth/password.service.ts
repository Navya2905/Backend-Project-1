import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keyLength: number) => Promise<Buffer>;

const KEY_LENGTH = 64;

// Stored format: scrypt$<salt base64>$<hash base64>
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, KEY_LENGTH);
    return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, saltB64, keyB64] = stored.split('$');
    if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;

    const expected = Buffer.from(keyB64, 'base64');
    const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
    // Constant-time comparison so response timing doesn't leak how many bytes matched.
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
