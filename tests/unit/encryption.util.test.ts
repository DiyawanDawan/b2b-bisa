import {
  decryptField,
  decryptJsonValue,
  encryptField,
  encryptFieldDeterministic,
  encryptJsonValue,
  getPayloadVersion,
  isEncryptedPayload,
  needsReencryption,
  reencryptField,
} from '../../src/utils/encryption.util';
import {
  revealAddress,
  revealShippingAddressSnapshot,
  sealAddress,
  sealShippingAddressSnapshot,
} from '../../src/utils/piiField.util';
import { getActiveEncryptionVersion } from '../../src/utils/env.util';

describe('encryption.util', () => {
  it('round-trips encryptField / decryptField', () => {
    const plain = '1234567890';
    const sealed = encryptField(plain);
    expect(isEncryptedPayload(sealed)).toBe(true);
    expect(decryptField(sealed)).toBe(plain);
    expect(getPayloadVersion(sealed)).toBe(getActiveEncryptionVersion());
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

  it('reencryptField is idempotent on the active version', () => {
    const sealed = encryptField('rotate-target', '1');
    expect(getPayloadVersion(sealed)).toBe('1');
    const once = reencryptField(sealed, getActiveEncryptionVersion());
    expect(decryptField(once)).toBe('rotate-target');
    expect(needsReencryption(once, getActiveEncryptionVersion())).toBe(false);
    expect(reencryptField(once)).toBe(once);
  });
});

describe('piiField.util', () => {
  it('seals and reveals address fields', () => {
    const plain = 'Jl. Merdeka No. 1, Jakarta';
    const sealed = sealAddress(plain);
    expect(isEncryptedPayload(sealed!)).toBe(true);
    expect(revealAddress(sealed)).toBe(plain);
    expect(revealAddress(plain)).toBe(plain);
  });

  it('seals shipping snapshot as JSON ciphertext string', () => {
    const snapshot = { recipient: 'A', phone: '081', address: 'Jl. A' };
    const sealed = sealShippingAddressSnapshot(snapshot);
    expect(typeof sealed).toBe('string');
    expect(isEncryptedPayload(sealed as string)).toBe(true);
    expect(revealShippingAddressSnapshot(sealed)).toEqual(snapshot);
  });

  it('does not double-encrypt shipping snapshot', () => {
    const snapshot = { recipient: 'B', address: 'Jl. B' };
    const once = sealShippingAddressSnapshot(snapshot) as string;
    const twice = sealShippingAddressSnapshot(once) as string;
    expect(twice).toBe(once);
    expect(revealShippingAddressSnapshot(twice)).toEqual(snapshot);
  });

  it('reveals legacy plaintext shipping snapshot objects', () => {
    const legacy = { recipient: 'Legacy', address: 'Old Rd' };
    expect(revealShippingAddressSnapshot(legacy)).toEqual(legacy);
  });
});
