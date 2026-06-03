import AppError from './appError';
import { isXenditWebhookDevMode } from '#utils/xenditWebhookDev.util';

/** 403 / REQUEST_FORBIDDEN — biasanya API key belum punya scope Payment Requests. */
export const isXenditForbiddenError = (err: unknown): boolean => {
  const e = err as { status?: number; errorCode?: string; response?: { status?: number } };
  const status = e?.status ?? e?.response?.status;
  return status === 403 || e?.errorCode === 'REQUEST_FORBIDDEN_ERROR';
};

/**
 * Di development, jika Payment Request ditolak (403), boleh lanjut ke Invoice
 * supaya alur bayar tetap bisa diuji tanpa VA/QR langsung.
 *
 * - `XENDIT_FALLBACK_TO_INVOICE_ON_FORBIDDEN=true`  → paksa fallback (semua env)
 * - `XENDIT_FALLBACK_TO_INVOICE_ON_FORBIDDEN=false` → tidak pernah fallback
 * - default: aktif hanya saat NODE_ENV !== 'production'
 */
export const shouldFallbackXenditDirectToInvoice = (err: unknown): boolean => {
  if (!isXenditForbiddenError(err)) return false;
  if (isXenditWebhookDevMode()) return false;
  const flag = process.env.XENDIT_FALLBACK_TO_INVOICE_ON_FORBIDDEN?.trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
};

/**
 * Translasi error Xendit SDK ke `AppError` yang aman dipakai sebagai response
 * HTTP. Penting karena:
 *
 * 1. Xendit SDK melempar object dengan `status`, `errorCode`, dan `errorMessage`
 *    yang teknis (dan tidak masuk akal untuk user akhir).
 * 2. Beberapa error (terutama 401/403) butuh **petunjuk konfigurasi**
 *    bukan sekadar pesan generic.
 * 3. Kita tidak boleh membocorkan stack trace Xendit kembali ke client.
 *
 * Cara pakai:
 *
 * ```ts
 * try {
 *   const invoice = await xenditClient.Invoice.createInvoice({ data });
 * } catch (err) {
 *   throw translateXenditError(err, 'membuat invoice pembayaran');
 * }
 * ```
 */
export const translateXenditError = (err: unknown, action: string): AppError => {
  const e = err as {
    status?: number;
    errorCode?: string;
    errorMessage?: string;
    message?: string;
    response?: { status?: number; message?: string; error_code?: string };
  };
  const status: number | undefined = e?.status ?? e?.response?.status;
  const errorCode: string | undefined = e?.errorCode ?? e?.response?.error_code;

  if (status === 401) {
    return new AppError(
      `Konfigurasi pembayaran salah: API key Xendit tidak valid. ` +
        `Verifikasi XENDIT_PAYMENT_SECRET_KEY di .env dan pastikan tidak ada spasi/typo. ` +
        `Gagal saat ${action}.`,
      503,
    );
  }

  if (status === 403 || errorCode === 'REQUEST_FORBIDDEN_ERROR') {
    const devHint = isXenditWebhookDevMode()
      ? ' Mode XENDIT_WEBHOOK_DEV aktif: aktifkan Write Payment Requests + Payment Methods di API key TEST, daftarkan ngrok ke Callbacks Xendit.'
      : process.env.NODE_ENV !== 'production'
        ? ' Di development, set XENDIT_MOCK_PAYMENT=true atau pastikan XENDIT_MOCK_ON_FORBIDDEN tidak "false".'
        : '';
    return new AppError(
      `API key Xendit tidak punya izin untuk ${action}. ` +
        `Buka Xendit Dashboard (mode Test) → Settings → Developers → API Keys → ` +
        `edit Secret Key yang sama dengan XENDIT_PAYMENT_SECRET_KEY di .env, ` +
        `aktifkan Write: Invoices, Payment Methods, Payment Requests. Save, tunggu 1–2 menit.` +
        devHint,
      503,
    );
  }

  if (status === 429) {
    return new AppError(
      'Server pembayaran sedang sibuk (rate limit). Silakan coba lagi dalam beberapa detik.',
      503,
    );
  }

  if (status && status >= 500) {
    return new AppError(
      `Layanan pembayaran sedang gangguan saat ${action} (Xendit ${status}). ` +
        `Mohon coba beberapa saat lagi.`,
      502,
    );
  }

  // 4xx lain: kemungkinan validasi (amount, channel code, dll)
  const detail = e?.errorMessage ?? e?.response?.message ?? e?.message ?? 'Error tidak diketahui';
  return new AppError(
    `Gagal ${action}: ${detail}` + (errorCode ? ` [${errorCode}]` : ''),
    typeof status === 'number' ? status : 502,
  );
};
