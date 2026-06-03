import AppError from '#utils/appError';
import { getMediaBaseUrl, PORT } from '#utils/env.util';
import { handleXenditPaymentRequestWebhook } from '#services/payment.service';

/**
 * Mode development: pembayaran & simulasi lunas lewat endpoint webhook Xendit
 * (POST /payments/session-webhook), bukan update DB langsung / mock VA.
 *
 * Set `XENDIT_WEBHOOK_DEV=true` + `API_PUBLIC_URL` (ngrok) + token callback Xendit.
 */
export const isXenditWebhookDevMode = (): boolean =>
  process.env.XENDIT_WEBHOOK_DEV?.trim().toLowerCase() === 'true';

export const getXenditWebhookBaseUrl = (): string => {
  const base = getMediaBaseUrl();
  if (base && !base.includes('localhost')) return base;
  return `http://localhost:${PORT}`;
};

export const getXenditWebhookEndpointUrls = () => {
  const base = getXenditWebhookBaseUrl();
  return {
    paymentV3: `${base}/api/v1/payments/session-webhook`,
    invoice: `${base}/api/v1/payments/xendit-webhook`,
    payout: `${base}/api/v1/payments/payout-webhook`,
  };
};

export const buildPaymentSucceededV3Payload = (referenceId: string, amount: number) => ({
  event: 'payment.succeeded',
  data: {
    reference_id: referenceId,
    status: 'SUCCEEDED',
    amount,
  },
});

/**
 * Terapkan lunas lewat handler webhook Payment Request V3.
 * Jika `XENDIT_WEBHOOK_DEV=true`, kirim HTTP POST ke endpoint webhook lokal/ngrok
 * (sama seperti callback dari server Xendit).
 */
export const applyPaymentSucceededWebhook = async (
  referenceId: string,
  amount: number,
): Promise<void> => {
  const webhookToken = process.env.XENDIT_WEBHOOK_TOKEN?.trim();
  if (!webhookToken) {
    throw new AppError(
      'XENDIT_WEBHOOK_TOKEN belum dikonfigurasi. Salin Verification Token dari Xendit Dashboard → Developers → Callbacks.',
      500,
    );
  }

  const payload = buildPaymentSucceededV3Payload(referenceId, amount);
  const urls = getXenditWebhookEndpointUrls();

  if (isXenditWebhookDevMode()) {
    console.log(
      `[XENDIT WEBHOOK DEV] Simulasi callback Xendit → POST ${urls.paymentV3} (reference=${referenceId})`,
    );
    const res = await fetch(urls.paymentV3, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-callback-token': webhookToken,
      },
      body: JSON.stringify(payload),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      throw new AppError(
        `Webhook dev callback gagal (${res.status}): ${bodyText.slice(0, 200)}`,
        502,
      );
    }
    console.log(
      `[XENDIT WEBHOOK DEV] Callback OK (${res.status}) — pesanan diupdate via handler webhook.`,
    );
    return;
  }

  await handleXenditPaymentRequestWebhook(payload, webhookToken);
};

export const logXenditWebhookDevStartup = (): void => {
  if (!isXenditWebhookDevMode()) return;

  const urls = getXenditWebhookEndpointUrls();
  const hasPublicUrl = !getXenditWebhookBaseUrl().includes('localhost');
  const tokenSet = Boolean(process.env.XENDIT_WEBHOOK_TOKEN?.trim());

  console.log(
    '[XENDIT WEBHOOK DEV] Mode aktif — pembayaran lunas via webhook (bukan mock DB langsung).',
  );
  console.log(`  Payment Request v3 → ${urls.paymentV3}`);
  console.log(`  Invoice (legacy)   → ${urls.invoice}`);

  if (!hasPublicUrl) {
    console.warn(
      '[XENDIT WEBHOOK DEV] API_PUBLIC_URL / NGROK_URL belum diset — callback dari server Xendit ' +
        'tidak bisa reach localhost. Jalankan ngrok dan set API_PUBLIC_URL=https://xxx.ngrok-free.app',
    );
  }
  if (!tokenSet) {
    console.warn('[XENDIT WEBHOOK DEV] XENDIT_WEBHOOK_TOKEN kosong — webhook akan ditolak 401.');
  }
  console.log(
    '[XENDIT WEBHOOK DEV] Matikan mock: XENDIT_MOCK_PAYMENT=false, XENDIT_MOCK_ON_FORBIDDEN=false',
  );
};
