import {
  convertIdrForDisplay,
  getExchangeRates,
  isSupportedDisplayCurrency,
} from '../../src/services/exchange-rate.service';

describe('exchange-rate.service (FB-19)', () => {
  it('returns supported quotes with IDR base', () => {
    const rates = getExchangeRates();
    expect(rates.base).toBe('IDR');
    expect(rates.quotes.IDR).toBe(1);
    expect(rates.quotes.USD).toBeGreaterThan(0);
    expect(rates.supported).toContain('USD');
  });

  it('convertIdrForDisplay keeps IDR unchanged', () => {
    expect(convertIdrForDisplay(1_500_000, 'IDR')).toBe(1_500_000);
  });

  it('convertIdrForDisplay converts to USD', () => {
    const usd = convertIdrForDisplay(15_800, 'USD');
    expect(usd).toBeCloseTo(1, 2);
  });

  it('isSupportedDisplayCurrency accepts known codes', () => {
    expect(isSupportedDisplayCurrency('usd')).toBe(true);
    expect(isSupportedDisplayCurrency('XYZ')).toBe(false);
  });
});
