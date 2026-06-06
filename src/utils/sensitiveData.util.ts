/** Mask nomor rekening: tampilkan 4 digit terakhir. */
export const maskAccountNumber = (accountNumber?: string | null): string => {
  if (!accountNumber) return '';
  const digits = accountNumber.replace(/\s/g, '');
  if (digits.length <= 4) return '****';
  return `****${digits.slice(-4)}`;
};

/** Mask NPWP untuk tampilan API. */
export const maskNPWP = (npwp?: string | null): string => {
  if (!npwp) return '';
  if (npwp.length >= 15) {
    return `••.•••.•••.•-•••.${npwp.slice(-3)}`;
  }
  return '••.•••.•••.•-•••.xxx';
};
