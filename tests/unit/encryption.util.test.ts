import {
  decryptField,
  decryptJsonValue,
  encryptField,
  encryptFieldDeterministic,
  encryptJsonValue,
  isEncryptedPayload,
} from '../../src/utils/encryption.util';

describe('encryption.util', () => {
  it('round-trips encryptField / decryptField', () => {
    const plain = '1234567890';
    const sealed = encryptField(plain);
    expect(isEncryptedPayload(sealed)).toBe(true);
    expect(decryptField(sealed)).toBe(plain);
  });

  it('deterministic encryption is stable for same context', () => {
    const ctx = 'user-1:bank-1';
    const a = encryptFieldDeterministic('9876543210', ctx);
    const b = encryptFieldDeterministic('9876543210', ctx);
    expect(a).toBe(b);
    expect(decryptField(a)).toBe('9876543210');
  });

  it('detects tampered ciphertext', () => {
    const sealed = encryptField('secret');
    const tampered = sealed.replace(/.$/, sealed.endsWith('A') ? 'B' : 'A');
    expect(() => decryptField(tampered)).toThrow();
  });

  it('round-trips JSON provider actions', () => {
    const payload = { id: 'pr-1', actions: [{ type: 'VA', account_number: '123' }] };
    const sealed = encryptJsonValue(payload);
    expect(typeof sealed).toBe('string');
    expect(decryptJsonValue(sealed)).toEqual(payload);
  });

  it('decryptJsonValue supports legacy plaintext object', () => {
    const legacy = { id: 'legacy', _mock: true };
    expect(decryptJsonValue(legacy)).toEqual(legacy);
  });
});
