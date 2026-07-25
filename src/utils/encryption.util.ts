import crypto from 'crypto';
import { Prisma } from '#prisma';
import { getActiveEncryptionVersion, getEncryptionKeyBufferForVersion } from '#utils/env.util';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const VERSION_PREFIX = /^v(\d+):/;

export const isEncryptedPayload = (value: string): boolean => VERSION_PREFIX.test(value);

/** Extract `n` from `v{n}:...` ciphertext, or null if not encrypted. */
export const getPayloadVersion = (payload: string): string | null => {
  const match = payload.match(VERSION_PREFIX);
  return match?.[1] ?? null;
};

export const needsReencryption = (
  payload: string,
  targetVersion = getActiveEncryptionVersion(),
): boolean => {
  if (!payload || !isEncryptedPayload(payload)) return false;
  return getPayloadVersion(payload) !== targetVersion;
};

const parsePayload = (
  payload: string,
): { version: string; iv: Buffer; tag: Buffer; ciphertext: Buffer } => {
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

const sealWithRandomIv = (plaintext: string, version: string): string => {
  const key = getEncryptionKeyBufferForVersion(version);
  const iv = crypto.randomBytes(IV_LENGTH);
  return encryptWithKey(plaintext, key, version, iv);
};

const sealWithDeterministicIv = (plaintext: string, context: string, version: string): string => {
  const key = getEncryptionKeyBufferForVersion(version);
  const iv = crypto
    .createHmac('sha256', key)
    .update(`iv:${context}`)
    .digest()
    .subarray(0, IV_LENGTH);
  return encryptWithKey(plaintext, key, version, iv);
};

/** Random IV — untuk NPWP, providerActions, dll. Writes use active key version (v2 when set). */
export const encryptField = (plaintext: string, version = getActiveEncryptionVersion()): string => {
  if (!plaintext) return plaintext;
  if (isEncryptedPayload(plaintext)) return plaintext;
  return sealWithRandomIv(plaintext, version);
};

/** Deterministic IV — untuk accountNumber agar unique index DB tetap valid. */
export const encryptFieldDeterministic = (
  plaintext: string,
  context: string,
  version = getActiveEncryptionVersion(),
): string => {
  if (!plaintext) return plaintext;
  if (isEncryptedPayload(plaintext)) return plaintext;
  return sealWithDeterministicIv(plaintext, context, version);
};

export const decryptField = (payload: string): string => {
  if (!payload || !isEncryptedPayload(payload)) return payload;
  const version = getPayloadVersion(payload) ?? '1';
  const key = getEncryptionKeyBufferForVersion(version);
  return decryptWithKey(payload, key);
};

export const decryptFieldDeterministic = (payload: string, _context: string): string =>
  decryptField(payload);

/**
 * Re-encrypt an already-sealed (or plaintext) value to `targetVersion`.
 * Safe to call repeatedly when payload is already on the target version.
 */
export const reencryptField = (
  payload: string,
  targetVersion = getActiveEncryptionVersion(),
): string => {
  if (!payload) return payload;
  if (isEncryptedPayload(payload) && getPayloadVersion(payload) === targetVersion) {
    return payload;
  }
  const plain = isEncryptedPayload(payload) ? decryptField(payload) : payload;
  return sealWithRandomIv(plain, targetVersion);
};

export const reencryptFieldDeterministic = (
  payload: string,
  context: string,
  targetVersion = getActiveEncryptionVersion(),
): string => {
  if (!payload) return payload;
  if (isEncryptedPayload(payload) && getPayloadVersion(payload) === targetVersion) {
    return payload;
  }
  const plain = isEncryptedPayload(payload) ? decryptField(payload) : payload;
  return sealWithDeterministicIv(plain, context, targetVersion);
};

export const encryptJsonValue = (value: unknown): string => encryptField(JSON.stringify(value));

export const reencryptJsonValue = (
  stored: unknown,
  targetVersion = getActiveEncryptionVersion(),
): string => {
  if (typeof stored === 'string' && isEncryptedPayload(stored)) {
    if (getPayloadVersion(stored) === targetVersion) return stored;
    const plain = decryptField(stored);
    return sealWithRandomIv(plain, targetVersion);
  }
  return sealWithRandomIv(JSON.stringify(stored), targetVersion);
};

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
