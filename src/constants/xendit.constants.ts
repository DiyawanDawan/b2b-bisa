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
  id: string;
  external_id?: string;
  reference_id?: string;
  status: string;
  amount?: number;
  payment_method?: string;
  created?: string;
  updated?: string;
  currency?: string;
}
