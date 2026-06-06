import AppError from '../../src/utils/appError';
import {
  assertAllowedFolder,
  buildR2ObjectKey,
  computeMultipartPlan,
  maxBytesForMime,
  parseCompletedParts,
  sanitizeUploadFileName,
} from '../../src/utils/mediaUpload.util';

describe('mediaUpload.util', () => {
  it('computeMultipartPlan uses single part for small files', () => {
    expect(computeMultipartPlan(1024)).toEqual({ partSize: 1024, totalParts: 1 });
  });

  it('computeMultipartPlan splits large files into 5MB chunks', () => {
    const plan = computeMultipartPlan(12 * 1024 * 1024);
    expect(plan.partSize).toBe(5 * 1024 * 1024);
    expect(plan.totalParts).toBe(3);
  });

  it('rejects invalid file size', () => {
    expect(() => computeMultipartPlan(0)).toThrow(AppError);
  });

  it('assertAllowedFolder accepts verification and disputes', () => {
    expect(assertAllowedFolder('verification')).toBe('verification');
    expect(assertAllowedFolder('disputes')).toBe('disputes');
  });

  it('assertAllowedFolder rejects unknown folder', () => {
    expect(() => assertAllowedFolder('../../../etc')).toThrow(AppError);
  });

  it('maxBytesForMime applies PDF limit', () => {
    expect(maxBytesForMime('application/pdf')).toBe(20 * 1024 * 1024);
    expect(maxBytesForMime('image/jpeg')).toBe(50 * 1024 * 1024);
  });

  it('buildR2ObjectKey scopes under user folder', () => {
    const key = buildR2ObjectKey('products', 'user-1', 'photo.jpg');
    expect(key.startsWith('products/user-1/')).toBe(true);
    expect(key.endsWith('.jpg')).toBe(true);
  });

  it('sanitizeUploadFileName strips unsafe characters', () => {
    expect(sanitizeUploadFileName('../../evil.png')).not.toContain('/');
    expect(sanitizeUploadFileName('')).toBe('upload.bin');
  });

  it('parseCompletedParts normalizes stored JSON', () => {
    const parts = parseCompletedParts([
      { partNumber: 2, etag: 'b', size: 100 },
      { partNumber: 1, etag: 'a', size: 50 },
      { bad: true },
    ]);
    expect(parts).toHaveLength(2);
    expect(parts[0].partNumber).toBe(2);
  });
});
