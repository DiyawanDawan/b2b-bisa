/**
 * Xendit Webhook & Status Constants
 * Based on Xendit API V3 and Disbursement V2 standards
 */

export enum XenditInvoiceStatus {
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  PENDING = 'PENDING',
}

export enum XenditPayoutStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  VOIDED = 'VOIDED',
}

export enum XenditPaymentRequestStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  PENDING = 'PENDING',
}

/**
 * Common Xendit Webhook Payload Interface
 */
export interface XenditWebhookPayload {
  id?: string;
  external_id?: string;
  reference_id?: string;
  status?: string;
  amount?: number;
  payment_method?: string;
  created?: string;
  updated?: string;
  currency?: string;
  event?: string;
  data?: {
    id?: string;
    external_id?: string;
    reference_id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    payment_request_id?: string;
  };
}

export type XenditWebhookKind = 'invoice' | 'payment_v3' | 'payout' | 'ignored' | 'unknown';

export type NormalizedXenditWebhook = {
  externalId?: string;
  status: string;
  amount?: number;
  event?: string;
  kind: XenditWebhookKind;
  /** @deprecated use kind === 'payment_v3' */
  isPaymentV3: boolean;
};

const PAYMENT_V3_EVENT_PREFIXES = ['payment.', 'payment_request.'] as const;
const IGNORED_EVENT_PREFIXES = ['payment_method.'] as const;
const PAYOUT_EVENT_PREFIXES = ['payout.', 'disbursement.'] as const;

/**
 * Normalizes legacy Invoice webhooks and Payment API v3 webhooks
 * ({ event, data: { reference_id, status, amount } }) into one shape.
 */
export function normalizeXenditWebhookPayload(body: unknown): NormalizedXenditWebhook {
  const root = (body && typeof body === 'object' ? body : {}) as XenditWebhookPayload;
  const event = typeof root.event === 'string' ? root.event : undefined;
  const nested = root.data && typeof root.data === 'object' ? root.data : null;
  const source = nested ?? root;

  const externalId =
    source.reference_id ?? source.external_id ?? root.external_id ?? root.reference_id;

  const status = source.status ?? root.status ?? '';
  const amount =
    source.amount != null
      ? Number(source.amount)
      : root.amount != null
        ? Number(root.amount)
        : undefined;

  let kind: XenditWebhookKind = 'unknown';

  if (event && IGNORED_EVENT_PREFIXES.some((p) => event.startsWith(p))) {
    kind = 'ignored';
  } else if (event && PAYOUT_EVENT_PREFIXES.some((p) => event.startsWith(p))) {
    kind = 'payout';
  } else if (event && PAYMENT_V3_EVENT_PREFIXES.some((p) => event.startsWith(p))) {
    kind = 'payment_v3';
  } else if (root.external_id && !event) {
    // Legacy flat Invoice payload: { external_id, status, amount }
    kind = 'invoice';
  } else if (externalId && nested?.reference_id) {
    kind = 'payment_v3';
  } else if (externalId && !event) {
    kind = 'invoice';
  }

  const isPaymentV3 = kind === 'payment_v3';

  return { externalId, status, amount, event, kind, isPaymentV3 };
}
