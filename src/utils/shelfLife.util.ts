import AppError from '#utils/appError';

/**
 * Parse ETD kurir (RajaOngkir dll.) → hari maksimum.
 * Contoh: "2-3", "1-2 hari", "4", "3 HARI" → 3 / 2 / 4 / 3
 */
export const parseEtdMaxDays = (etd?: string | null): number | null => {
  if (!etd || typeof etd !== 'string') return null;
  const nums = [...etd.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
  if (nums.length === 0) return null;
  return Math.max(...nums);
};

/**
 * Validasi: estimasi pengiriman tidak boleh melebihi ketahanan produk hasil tani.
 */
export const assertShippingWithinShelfLife = (params: {
  productMode?: string | null;
  shelfLifeDays?: number | null;
  etd?: string | null;
  productName?: string;
}): void => {
  const { productMode, shelfLifeDays, etd, productName } = params;
  if (productMode !== 'ORGANIC_PRODUCE') return;
  if (shelfLifeDays == null || shelfLifeDays <= 0) return;

  const etdDays = parseEtdMaxDays(etd);
  if (etdDays == null) return;

  if (etdDays > shelfLifeDays) {
    const label = productName ? ` "${productName}"` : '';
    throw new AppError(
      `Estimasi pengiriman ${etdDays} hari melebihi ketahanan produk${label} (${shelfLifeDays} hari). Pilih kurir/layanan yang lebih cepat, atau pesan pre-harvest jika stok belum siap.`,
      400,
    );
  }
};
