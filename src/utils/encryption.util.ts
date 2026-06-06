import crypto from 'crypto';
import { Prisma } from '#prisma';
import { getEncryptionKeyBufferForVersion } from '#utils/env.util';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const VERSION_PREFIX = /^v(\d+):/;

export const isEncryptedPayload = (value: string): boolean => VERSION_PREFIX.test(value);

const parsePayload = (payload: string): { version: string; iv: Buffer; tag: Buffer; ciphertext: Buffer } => {
  const match = payload.match(/^v(\d+):([^:]+):([^:]+):(.+)$/);
  if (!match) throw new Error('Invalid encrypted payload format.');
  return {
    version: match[1],
    iv: Buffer.from(match[2], 'base64url'),
    tag: Buffer.from(match[3], 'base64url'),
    ciphertext: Buffer.from(match[4], 'base64url'),
  };
};

const formatPayload = (version: string, iv: Buffer, tag: Buffer, ciphertext: Buffer): string =>
  `v${version}:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;

const encryptWithKey = (plaintext: string, key: Buffer, version: string, iv: Buffer): string => {
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return formatPayload(version, iv, tag, encrypted);
};

const decryptWithKey = (payload: string, key: Buffer): string => {
  const { iv, tag, ciphertext } = parsePayload(payload);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};

/** Random IV — untuk NPWP, providerActions, dll. */
export const encryptField = (plaintext: string, version = '1'): string => {
  if (!plaintext) return plaintext;
  if (isEncryptedPayload(plaintext)) return plaintext;
  const key = getEncryptionKeyBufferForVersion(version);
  const iv = crypto.randomBytes(IV_LENGTH);
  return encryptWithKey(plaintext, key, version, iv);
};

/** Deterministic IV — untuk accountNumber agar unique index DB tetap valid. */
export const encryptFieldDeterministic = (
  plaintext: string,
  context: string,
  version = '1',
): string => {
  if (!plaintext) return plaintext;
  if (isEncryptedPayload(plaintext)) return plaintext;
  const key = getEncryptionKeyBufferForVersion(version);
  const iv = crypto
    .createHmac('sha256', key)
    .update(`iv:${context}`)
    .digest()
    .subarray(0, IV_LENGTH);
  return encryptWithKey(plaintext, key, version, iv);
};

export const decryptField = (payload: string): string => {
  if (!payload || !isEncryptedPayload(payload)) return payload;
  const versionMatch = payload.match(VERSION_PREFIX);
  const version = versionMatch?.[1] ?? '1';
  const key = getEncryptionKeyBufferForVersion(version);
  return decryptWithKey(payload, key);
};

export const decryptFieldDeterministic = (payload: string, _context: string): string =>
  decryptField(payload);

export const encryptJsonValue = (value: unknown): string => encryptField(JSON.stringify(value));

export const decryptJsonValue = (stored: unknown): unknown | null => {
  if (stored == null) return null;
  if (typeof stored === 'string') {
    if (isEncryptedPayload(stored)) {
      return JSON.parse(decryptField(stored));
    }
    try {
      return JSON.parse(stored);
    } catch {
      return stored;
    }
  }
  return stored;
};

export const sealProviderActions = (value: unknown): Prisma.InputJsonValue =>
  encryptJsonValue(value) as unknown as Prisma.InputJsonValue;

export const resolveProviderActions = (stored: unknown): unknown | null => decryptJsonValue(stored);
