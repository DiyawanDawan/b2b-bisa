jest.mock('#utils/retry.util', () => ({
  withRetry: (fn: () => unknown) => fn(),
}));

jest.mock('#config/prisma', () => ({
  __esModule: true,
  default: {
    transaction: { updateMany: jest.fn() },
    wallet: { upsert: jest.fn() },
    order: { update: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

import { Prisma } from '#prisma';
import prisma from '#config/prisma';
import { executeDisputeReleaseInTx } from '../../src/services/wallet.service';

describe('executeDisputeReleaseInTx', () => {
  const sellerId = 'seller-1';
  const orderId = 'order-1';
  const txMock = prisma as unknown as {
    transaction: { updateMany: jest.Mock };
    wallet: { upsert: jest.Mock };
    order: { update: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    txMock.transaction.updateMany.mockResolvedValue({ count: 1 });
    txMock.wallet.upsert.mockResolvedValue({ balance: new Prisma.Decimal(1_000_000) });
    txMock.order.update.mockResolvedValue({ id: orderId, status: 'COMPLETED' });
    txMock.$queryRaw.mockResolvedValue([]);
  });

  it('credits supplier wallet with sellerAmount on RELEASE', async () => {
    const sellerAmount = new Prisma.Decimal(485_000);

    await executeDisputeReleaseInTx(txMock as never, {
      id: orderId,
      buyerId: 'buyer-1',
      sellerId,
      transaction: {
        id: 'trx-1',
        status: 'ESCROW_HELD',
        sellerAmount,
        amount: new Prisma.Decimal(500_000),
        paymentRequestId: 'pay-1',
        paymentStatus: 'SUCCESS',
      },
    });

    expect(txMock.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ESCROW_HELD' }),
        data: expect.objectContaining({ status: 'RELEASED' }),
      }),
    );

    expect(txMock.wallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: sellerId },
        update: {
          balance: { increment: sellerAmount },
          totalEarned: { increment: sellerAmount },
        },
      }),
    );
  });

  it('rejects idempotent double-release when escrow no longer ESCROW_HELD', async () => {
    txMock.transaction.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      executeDisputeReleaseInTx(txMock as never, {
        id: orderId,
        buyerId: 'buyer-1',
        sellerId,
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
