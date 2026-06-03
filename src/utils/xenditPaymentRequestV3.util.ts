import AppError from '#utils/appError';
import { translateXenditError } from '#utils/xenditError.util';

const XENDIT_API_BASE = 'https://api.xendit.co';
const XENDIT_API_VERSION = '2024-11-11';

type XenditV3Json = Record<string, unknown>;

const parseXenditErrorBody = (body: unknown): string => {
  if (!body || typeof body !== 'object') return 'Error Xendit tidak diketahui';
  const b = body as XenditV3Json;
  const message = b.message ?? b.error_message ?? b.errorMessage;
  if (typeof message === 'string' && message.trim()) return message;
  return 'Error Xendit tidak diketahui';
};

async function xenditV3Request(
  method: 'POST' | 'GET',
  path: string,
  secretKey: string,
  body?: unknown,
): Promise<XenditV3Json> {
  const auth = Buffer.from(`${secretKey}:`).toString('base64');
  const response = await fetch(`${XENDIT_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'api-version': XENDIT_API_VERSION,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { message: text };
    }
  }

  if (!response.ok) {
    const err = Object.assign(new Error(parseXenditErrorBody(json)), {
      status: response.status,
      errorCode: (json as XenditV3Json).error_code,
      errorMessage: parseXenditErrorBody(json),
      response: { status: response.status, message: parseXenditErrorBody(json) },
    });
    throw err;
  }

  return (json && typeof json === 'object' ? json : {}) as XenditV3Json;
}

/** POST /v3/payment_requests/{id}/cancel */
export const cancelPaymentRequestV3 = async (
  paymentRequestId: string,
  secretKey: string,
): Promise<XenditV3Json> => {
  try {
    return await xenditV3Request(
      'POST',
      `/v3/payment_requests/${encodeURIComponent(paymentRequestId)}/cancel`,
      secretKey,
    );
  } catch (err) {
    throw translateXenditError(err, 'membatalkan payment request');
  }
};

/** POST /v3/payment_requests/{id}/simulate — test mode only */
export const simulatePaymentRequestV3 = async (
  paymentRequestId: string,
  amount: number,
  secretKey: string,
): Promise<XenditV3Json> => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Nominal simulasi tidak valid.', 400);
  }
  try {
    return await xenditV3Request(
      'POST',
      `/v3/payment_requests/${encodeURIComponent(paymentRequestId)}/simulate`,
      secretKey,
      { amount },
    );
  } catch (err) {
    throw translateXenditError(err, 'mensimulasikan pembayaran (test mode)');
  }
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
