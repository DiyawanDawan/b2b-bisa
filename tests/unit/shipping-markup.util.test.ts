import {
  applyShippingMarkup,
  normalizeMarkupConfig,
} from '../../src/utils/shipping-markup.util';

describe('shipping-markup.util', () => {
  describe('applyShippingMarkup', () => {
    it('applies percent + flat: 20000 + 10% + 2000 = 24000', () => {
      const result = applyShippingMarkup(20_000, {
        markupPercent: 10,
        markupFlat: 2_000,
      });
      expect(result).toEqual({
        cost: 24_000,
        baseCost: 20_000,
        markupAmount: 4_000,
      });
    });

    it('treats null/undefined markup as zero', () => {
      expect(applyShippingMarkup(15_000, null)).toEqual({
        cost: 15_000,
        baseCost: 15_000,
        markupAmount: 0,
      });
      expect(applyShippingMarkup(15_000)).toEqual({
        cost: 15_000,
        baseCost: 15_000,
        markupAmount: 0,
      });
    });

    it('clamps negative markup inputs to zero (never below base)', () => {
      const result = applyShippingMarkup(10_000, {
        markupPercent: -5,
        markupFlat: -500,
      });
      expect(result.cost).toBe(10_000);
      expect(result.markupAmount).toBe(0);
    });

    it('rounds to nearest rupiah', () => {
      // 10001 * 1.1 = 11001.1 → 11001
      expect(applyShippingMarkup(10_001, { markupPercent: 10, markupFlat: 0 }).cost).toBe(
        11_001,
      );
    });
  });

  describe('normalizeMarkupConfig', () => {
    it('normalizes decimal-like values and negatives', () => {
      expect(normalizeMarkupConfig({ markupPercent: '12.5', markupFlat: '1000' })).toEqual({
        markupPercent: 12.5,
        markupFlat: 1000,
      });
      expect(normalizeMarkupConfig({ markupPercent: -1, markupFlat: null })).toEqual({
        markupPercent: 0,
        markupFlat: 0,
      });
    });
  });
});
