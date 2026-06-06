jest.mock('#services/notification.service', () => ({
  createNotification: jest.fn(),
}));

jest.mock('#config/pusher', () => ({
  __esModule: true,
  default: { trigger: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('#utils/mediaResolver.util', () => ({
  attachAdminChatThreadMedia: (payload: unknown) => payload,
}));

jest.mock('#config/prisma', () => ({
  __esModule: true,
  default: {
    negotiation: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
    },
  },
}));

import prisma from '#config/prisma';
import {
  ADMIN_MEDIATION_PREFIX,
  ensureDisputeNegotiationRoom,
} from '../../src/services/dispute-mediation.service';

describe('dispute mediation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a stable admin prefix for chat detection', () => {
    expect(ADMIN_MEDIATION_PREFIX).toBe('[Admin BISA]');
  });

  it('formats mediation content with prefix', () => {
    const body = 'Mohon kirim bukti resi asli.';
    const formatted = `${ADMIN_MEDIATION_PREFIX} ${body}`;
    expect(formatted.startsWith(ADMIN_MEDIATION_PREFIX)).toBe(true);
    expect(formatted).toContain(body);
  });

  it('creates negotiation room for direct-checkout disputed orders', async () => {
    (prisma.negotiation.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      orderNumber: 'ORD-001',
      totalAmount: 500_000,
      items: [{ productId: 'prod-1', quantity: 10, pricePerUnit: 50_000 }],
    });
    (prisma.negotiation.create as jest.Mock).mockResolvedValue({ id: 'neg-1' });

    const room = await ensureDisputeNegotiationRoom('order-1');

    expect(room.id).toBe('neg-1');
    expect(prisma.negotiation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
          specifications: 'Direct checkout — ruang mediasi sengketa',
        }),
      }),
    );
  });

  it('returns existing negotiation without creating duplicate room', async () => {
    (prisma.negotiation.findFirst as jest.Mock).mockResolvedValue({ id: 'neg-existing' });

    const room = await ensureDisputeNegotiationRoom('order-1');

    expect(room.id).toBe('neg-existing');
    expect(prisma.negotiation.create).not.toHaveBeenCalled();
  });
});
