import { PaymentMethod } from '#prisma';
import AppError from '#utils/appError';
import {
  assertPaymentAmountForChannel,
  buildXenditChannelProperties,
  extractXenditDirectPaymentData,
  mapMethodToXenditType,
  QRIS_MAX_AMOUNT_IDR,
  QRIS_MIN_AMOUNT_IDR,
  requirePaymentMethodGroup,
} from '#utils/paymentMethod.util';
import { buildMockPaymentInitResult } from '#utils/xenditMock.util';
import { normalizeXenditWebhookPayload } from '#constants/xendit.constants';

describe('paymentMethod.util — VA vs QRIS vs e-wallet', () => {
  describe('mapMethodToXenditType', () => {
    it('maps checkout groups to distinct Xendit PR types', () => {
      expect(mapMethodToXenditType(PaymentMethod.BANK_TRANSFER)).toBe('VIRTUAL_ACCOUNT');
      expect(mapMethodToXenditType(PaymentMethod.QRIS)).toBe('QR_CODE');
      expect(mapMethodToXenditType(PaymentMethod.E_WALLET)).toBe('EWALLET');
      expect(mapMethodToXenditType('VA')).toBe('VIRTUAL_ACCOUNT');
      expect(mapMethodToXenditType('EWALLET')).toBe('EWALLET');
    });

    it('rejects unsupported methods', () => {
      expect(() => mapMethodToXenditType('PAYLATER')).toThrow(AppError);
    });
  });

  describe('requirePaymentMethodGroup', () => {
    it('accepts valid groups', () => {
      expect(requirePaymentMethodGroup(PaymentMethod.QRIS)).toBe(PaymentMethod.QRIS);
      expect(requirePaymentMethodGroup('E_WALLET')).toBe(PaymentMethod.E_WALLET);
    });

    it('rejects null / empty group with 400 (never default to BANK_TRANSFER)', () => {
      expect(() => requirePaymentMethodGroup(null, 'Akulaku')).toThrow(AppError);
      try {
        requirePaymentMethodGroup(undefined);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
      }
    });
  });

  describe('buildXenditChannelProperties', () => {
    it('sets customerName for VA only', () => {
      const props = buildXenditChannelProperties({
        methodGroup: PaymentMethod.BANK_TRANSFER,
        customerName: 'Buyer Satu',
      });
      expect(props).toEqual({ customerName: 'Buyer Satu' });
      expect(props).not.toHaveProperty('successReturnUrl');
      expect(props).not.toHaveProperty('expiresAt');
    });

    it('sets expiresAt for QRIS (not VA fields)', () => {
      const expires = new Date('2030-01-01T00:00:00.000Z');
      const props = buildXenditChannelProperties({
        methodGroup: PaymentMethod.QRIS,
        qrisExpiresAt: expires,
        customerName: 'ShouldNotAppear',
      });
      expect(props.expiresAt).toEqual(expires);
      expect(props).not.toHaveProperty('customerName');
      expect(props).not.toHaveProperty('successReturnUrl');
    });

    it('sets success + failure return URLs for e-wallet', () => {
      const props = buildXenditChannelProperties({
        methodGroup: PaymentMethod.E_WALLET,
        channelCode: 'DANA',
        returnBaseUrl: 'https://app.example.com',
      });
      expect(props.successReturnUrl).toBe('https://app.example.com/payment/success');
      expect(props.failureReturnUrl).toBe('https://app.example.com/payment/failed');
      expect(props).not.toHaveProperty('customerName');
      expect(props).not.toHaveProperty('mobileNumber');
    });

    it('includes mobileNumber for OVO when provided', () => {
      const props = buildXenditChannelProperties({
        methodGroup: PaymentMethod.E_WALLET,
        channelCode: 'OVO',
        mobileNumber: '+6281234567890',
        returnBaseUrl: 'https://app.example.com',
      });
      expect(props.mobileNumber).toBe('+6281234567890');
    });
  });

  describe('assertPaymentAmountForChannel', () => {
    it('enforces QRIS floor 1500 even if channel min is lower', () => {
      expect(() =>
        assertPaymentAmountForChannel({
          amount: 1000,
          methodGroup: PaymentMethod.QRIS,
          minAmount: 1,
          maxAmount: QRIS_MAX_AMOUNT_IDR,
        }),
      ).toThrow(AppError);

      expect(() =>
        assertPaymentAmountForChannel({
          amount: QRIS_MIN_AMOUNT_IDR,
          methodGroup: PaymentMethod.QRIS,
          minAmount: 1,
          maxAmount: QRIS_MAX_AMOUNT_IDR,
        }),
      ).not.toThrow();
    });
  });

  describe('extractXenditDirectPaymentData', () => {
    it('extracts VA number from VIRTUAL_ACCOUNT fixture', () => {
      const extracted = extractXenditDirectPaymentData({
        payment_method: {
          type: 'VIRTUAL_ACCOUNT',
          virtual_account: {
            channel_code: 'BCA',
            channel_properties: {
              virtual_account_number: '88081234567890',
              customer_name: 'Buyer',
            },
          },
        },
      });
      expect(extracted?.paymentType).toBe('VIRTUAL_ACCOUNT');
      expect(extracted?.channelCode).toBe('BCA');
      expect(extracted?.paymentData.virtual_account_number).toBe('88081234567890');
      expect(extracted?.paymentData.qrString).toBeUndefined();
    });

    it('extracts qrString from QR_CODE channel_properties', () => {
      const extracted = extractXenditDirectPaymentData({
        paymentMethod: {
          type: 'QR_CODE',
          qrCode: {
            channelCode: 'QRIS',
            channelProperties: { qrString: '00020101021226550016ID.CO.QRIS...' },
          },
        },
      });
      expect(extracted?.paymentType).toBe('QR_CODE');
      expect(extracted?.channelCode).toBe('QRIS');
      expect(extracted?.paymentData.qrString).toContain('QRIS');
      expect(extracted?.paymentData.virtual_account_number).toBeUndefined();
    });

    it('extracts qrString from PRESENT_QR actions', () => {
      const extracted = extractXenditDirectPaymentData(
        {
          payment_method: { type: 'QR_CODE', qr_code: { channel_code: 'QRIS' } },
          actions: [{ action: 'PRESENT_QR', qr_code: 'MOCK-QR-PAYLOAD' }],
        },
        'QRIS',
      );
      expect(extracted?.paymentData.qrString).toBe('MOCK-QR-PAYLOAD');
    });

    it('extracts redirectUrl from EWALLET fixture', () => {
      const withActions = extractXenditDirectPaymentData({
        payment_method: {
          type: 'EWALLET',
          ewallet: {
            channel_code: 'OVO',
            channel_properties: {
              success_return_url: 'https://app.example.com/payment/success',
            },
          },
        },
        actions: [{ url: 'https://redirect.ovo.id/pay/abc' }],
      });
      expect(withActions?.paymentType).toBe('EWALLET');
      expect(withActions?.channelCode).toBe('OVO');
      expect(withActions?.paymentData.redirectUrl).toBe('https://redirect.ovo.id/pay/abc');

      const fromProps = extractXenditDirectPaymentData({
        payment_method: {
          type: 'EWALLET',
          ewallet: {
            channel_code: 'DANA',
            channel_properties: {
              success_return_url: 'https://app.example.com/payment/success',
            },
          },
        },
      });
      expect(fromProps?.paymentData.redirectUrl).toBe('https://app.example.com/payment/success');
    });
  });
});

describe('buildMockPaymentInitResult — init per tipe', () => {
  const base = {
    orderId: 'ord-1',
    orderNumber: 'ORD-1001',
    externalId: 'TRX-ORD-1001',
    amount: 50000,
    channelName: 'Test',
    customerName: 'Buyer',
  };

  it('VA returns virtual_account_number', () => {
    const { response } = buildMockPaymentInitResult({
      ...base,
      channelCode: 'BCA',
      methodGroup: PaymentMethod.BANK_TRANSFER,
    });
    expect(response.paymentType).toBe('VIRTUAL_ACCOUNT');
    const data = response.paymentData as Record<string, unknown>;
    expect(data.virtual_account_number).toMatch(/^8808/);
    expect(data.qrString).toBeUndefined();
  });

  it('QRIS returns qr_string / qrString', () => {
    const { response } = buildMockPaymentInitResult({
      ...base,
      channelCode: 'QRIS',
      methodGroup: PaymentMethod.QRIS,
    });
    expect(response.paymentType).toBe('QR_CODE');
    const data = response.paymentData as Record<string, unknown>;
    expect(data.qrString || data.qr_string).toBeTruthy();
    expect(data.virtual_account_number).toBeUndefined();
  });

  it('e-wallet returns redirectUrl', () => {
    const { response } = buildMockPaymentInitResult({
      ...base,
      channelCode: 'DANA',
      methodGroup: PaymentMethod.E_WALLET,
    });
    expect(response.paymentType).toBe('EWALLET');
    const data = response.paymentData as Record<string, unknown>;
    expect(data.redirectUrl).toContain('/payment/success');
    expect(data.virtual_account_number).toBeUndefined();
  });
});

describe('normalizeXenditWebhookPayload — qr.payment ignored', () => {
  it('classifies qr.payment as ignored (not payment_v3)', () => {
    const normalized = normalizeXenditWebhookPayload({
      event: 'qr.payment',
      data: { reference_id: 'ext-1', status: 'SUCCEEDED', amount: 1000 },
    });
    expect(normalized.kind).toBe('ignored');
    expect(normalized.isPaymentV3).toBe(false);
  });

  it('keeps payment.capture as payment_v3', () => {
    const normalized = normalizeXenditWebhookPayload({
      event: 'payment.capture',
      data: { reference_id: 'TRX-1', status: 'SUCCEEDED', amount: 50000 },
    });
    expect(normalized.kind).toBe('payment_v3');
    expect(normalized.externalId).toBe('TRX-1');
  });
});
