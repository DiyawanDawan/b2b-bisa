/**
 * Kode khusus BISA untuk checkout multi-supplier (beberapa toko, satu pembayaran).
 *
 * MCHK = Multi-Checkout (pembayaran gabungan).
 * Bukan kata generik "BATCH" — konsisten dengan branding BISA.
 */

/** externalId transaksi Xendit: TRX-BISA-MCHK-{checkoutBatchId} */
export const BISA_MULTI_CHECKOUT_PAYMENT_PREFIX = 'TRX-BISA-MCHK-';

/** Nomor pesanan yang ditampilkan buyer: ORD-BISA-MCHK-{YYYYMMDD}-{hex} */
export const BISA_MULTI_CHECKOUT_ORDER_PREFIX = 'ORD-BISA-MCHK';

/** @deprecated Gunakan BISA_MULTI_CHECKOUT_PAYMENT_PREFIX — alias kompatibilitas impor lama. */
export const BATCH_PAYMENT_EXTERNAL_PREFIX = BISA_MULTI_CHECKOUT_PAYMENT_PREFIX;

/** Prefix pembayaran lama — webhook tetap memproses transaksi existing. */
const LEGACY_MULTI_CHECKOUT_PAYMENT_PREFIXES = [
  'TRX-BISA-MCHK-',
  'TRX-BATCH-',
  'TRX-B2B-',
] as const;

/** Ambil checkoutBatchId dari externalId pembayaran gabungan (atau null jika bukan multi-checkout). */
export const parseCheckoutBatchIdFromExternalId = (externalId: string): string | null => {
  const trimmed = externalId.trim();
  for (const prefix of LEGACY_MULTI_CHECKOUT_PAYMENT_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      const id = trimmed.slice(prefix.length);
      return id.length > 0 ? id : null;
    }
  }
  return null;
};

export const isMultiCheckoutPaymentExternalId = (externalId: string): boolean =>
  parseCheckoutBatchIdFromExternalId(externalId) != null;
