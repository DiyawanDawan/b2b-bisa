import {
  reviewCertificateSchema,
  supplierStoreCertificateParamSchema,
  submitCertificateSchema,
} from '../../src/validations/product-certificate.validation';
import { assertMimeAllowedForFolder } from '../../src/utils/mediaUpload.util';

describe('product certificate validation', () => {
  it('requires rejection reason', () => {
    const result = reviewCertificateSchema.safeParse({ status: 'REJECTED' });
    expect(result.success).toBe(false);
  });

  it('accepts approval without rejection reason', () => {
    const result = reviewCertificateSchema.safeParse({ status: 'APPROVED' });
    expect(result.success).toBe(true);
  });

  it('rejects expiry before issue date', () => {
    const result = submitCertificateSchema.safeParse({
      title: 'Sertifikat Organik',
      certificateType: 'ORGANIC',
      storageKey: 'product-certificates/user/file.pdf',
      issuedAt: '2026-07-20',
      expiresAt: '2025-07-20',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid certificate metadata', () => {
    const result = submitCertificateSchema.safeParse({
      title: 'Sertifikat Organik',
      certificateType: 'ORGANIC',
      storageKey: 'product-certificates/user/file.pdf',
      issuedAt: '2025-07-20',
      expiresAt: '2027-07-20',
    });
    expect(result.success).toBe(true);
  });

  it('accepts supplier store certificate document params together', () => {
    const result = supplierStoreCertificateParamSchema.safeParse({
      id: '0ca753cd-bcef-4717-aa42-db9b4c5f46fc',
      certificateId: 'e68c1154-97ac-4b8f-950c-aaf312aa71bd',
    });

    expect(result.success).toBe(true);
  });

  it('rejects unsupported certificate media types', () => {
    expect(() => assertMimeAllowedForFolder('product-certificates', 'image/webp')).toThrow(
      'Sertifikat hanya mendukung PDF, JPG, JPEG, atau PNG.',
    );
  });
});
