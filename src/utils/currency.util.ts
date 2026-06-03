import { Prisma } from '#prisma';

/**
 * Xendit IDR hanya menerima bilangan bulat (0 desimal).
 * Fee/PPN persentase sering menghasilkan desimal — wajib dibulatkan sebelum API call.
 */
export const roundIdrAmount = (value: Prisma.Decimal | number | string): number => {
  const n = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isFinite(n)) {
    throw new Error(`Nominal IDR tidak valid: ${value}`);
  }
  return Math.round(n);
};

export const roundIdrDecimal = (value: Prisma.Decimal | number | string): Prisma.Decimal =>
  new Prisma.Decimal(roundIdrAmount(value));

/** Bandingkan nominal IDR setelah pembulatan (webhook vs DB). */
export const idrAmountsEqual = (
  a: Prisma.Decimal | number | string,
  b: Prisma.Decimal | number | string,
): boolean => roundIdrAmount(a) === roundIdrAmount(b);
