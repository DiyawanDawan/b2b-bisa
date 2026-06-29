/** FB-19 — Display-only FX rates (checkout tetap IDR). */
const QUOTES: Record<string, number> = {
  IDR: 1,
  USD: 15800,
  SGD: 11700,
  EUR: 17200,
};

const SUPPORTED = ['IDR', 'USD', 'SGD', 'EUR'] as const;
export type DisplayCurrency = (typeof SUPPORTED)[number];

export const getExchangeRates = () => ({
  base: 'IDR',
  quotes: QUOTES,
  supported: SUPPORTED,
  updatedAt: '2026-06-07',
  disclaimer:
    'Kurs indikatif untuk tampilan. Pembayaran dan penyelesaian tetap dalam IDR.',
});

export const convertIdrForDisplay = (amountIdr: number, currency: string): number => {
  const code = currency.toUpperCase();
  if (code === 'IDR') return amountIdr;
  const rate = QUOTES[code];
  if (!rate) return amountIdr;
  return Math.round((amountIdr / rate) * 100) / 100;
};

export const isSupportedDisplayCurrency = (currency: string): currency is DisplayCurrency =>
  SUPPORTED.includes(currency.toUpperCase() as DisplayCurrency);
