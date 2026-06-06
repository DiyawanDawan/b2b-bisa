jest.mock('#utils/retry.util', () => ({
  withRetry: (fn: () => unknown) => fn(),
}));

jest.mock('#config/prisma', () => ({
  __esModule: true,
  default: {
    transaction: { updateMany: jest.fn() },
    wallet: { upsert: jest.fn() },
    orderItem: { findMany: jest.fn() },
    product: { update: jest.fn() },
    order: { update: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

import { Prisma } from '#prisma';
import prisma from '#config/prisma';
import { executeDisputeRefundInTx } from '../../src/services/wallet.service';

describe('executeDisputeRefundInTx', () => {
  const buyerId = 'buyer-1';
  const orderId = 'order-1';
  const txMock = prisma as unknown as {
    transaction: { updateMany: jest.Mock };
    wallet: { upsert: jest.Mock };
    orderItem: { findMany: jest.Mock };
    product: { update: jest.Mock };
    order: { update: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    txMock.transaction.updateMany.mockResolvedValue({ count: 1 });
    txMock.orderItem.findMany.mockResolvedValue([]);
    txMock.order.update.mockResolvedValue({});
    txMock.$queryRaw.mockResolvedValue([]);
  });

  it('credits buyer wallet with full escrow amount on REFUND', async () => {
    const amount = new Prisma.Decimal(500_000);

    await executeDisputeRefundInTx(txMock as never, {
      id: orderId,
      buyerId,
      sellerId: 'seller-1',
      transaction: {
        id: 'trx-1',
        status: 'ESCROW_HELD',
        sellerAmount: new Prisma.Decimal(485_000),
        amount,
        paymentRequestId: 'pay-1',
        paymentStatus: 'SUCCESS',
      },
    });

    expect(txMock.wallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: buyerId },
        update: { balance: { increment: amount } },
      }),
    );
  });

  it('rejects idempotent double-refund when escrow no longer ESCROW_HELD', async () => {
    txMock.transaction.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      executeDisputeRefundInTx(txMock as never, {
        id: orderId,
        buyerId,
        sellerId: 'seller-1',
        transaction: {
          id: 'trx-1',
          status: 'ESCROW_HELD',
          sellerAmount: new Prisma.Decimal(485_000),
          amount: new Prisma.Decimal(500_000),
          paymentRequestId: 'pay-1',
          paymentStatus: 'SUCCESS',
        },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(txMock.wallet.upsert).not.toHaveBeenCalled();
  });
});
