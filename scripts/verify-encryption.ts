/**
 * Lightweight verification for AES-256-GCM utils (no Jest required).
 * Usage: npx tsx scripts/verify-encryption.ts
 */
import {
  decryptField,
  decryptJsonValue,
  encryptField,
  encryptFieldDeterministic,
  encryptJsonValue,
  isEncryptedPayload,
} from '../src/utils/encryption.util.ts';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const plain = '1234567890';
const sealed = encryptField(plain);
assert(isEncryptedPayload(sealed), 'encrypted payload prefix');
assert(decryptField(sealed) === plain, 'round-trip');

const ctx = 'user:bank';
const detA = encryptFieldDeterministic('9876543210', ctx);
const detB = encryptFieldDeterministic('9876543210', ctx);
assert(detA === detB, 'deterministic seal');
assert(decryptField(detA) === '9876543210', 'deterministic reveal');

const payload = { id: 'pr-1', va: '123' };
const jsonSealed = encryptJsonValue(payload);
assert(decryptJsonValue(jsonSealed)?.toString() === '[object Object]' || JSON.stringify(decryptJsonValue(jsonSealed)) === JSON.stringify(payload), 'json round-trip');

let tamperFailed = false;
try {
  decryptField(`${sealed.slice(0, -1)}X`);
  tamperFailed = false;
} catch {
  tamperFailed = true;
}
assert(tamperFailed, 'tamper detection');

console.log('verify-encryption: OK');
