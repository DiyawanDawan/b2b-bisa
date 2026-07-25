jest.mock('#config/prisma', () => ({
  __esModule: true,
  default: {
    voucher: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import prisma from '#config/prisma';
import { deleteOrDisableVoucherAdmin } from '../../src/services/voucher.service';
import AppError from '../../src/utils/appError';

const mockPrisma = prisma as unknown as {
  voucher: {
    findUnique: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

describe('deleteOrDisableVoucherAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hard-deletes vouchers with no redemptions', async () => {
    mockPrisma.voucher.findUnique.mockResolvedValue({
      id: 'v1',
      usageCount: 0,
      _count: { redemptions: 0 },
    });
    mockPrisma.voucher.delete.mockResolvedValue({});

    const result = await deleteOrDisableVoucherAdmin('v1');

    expect(result.action).toBe('deleted');
    expect(mockPrisma.voucher.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
    expect(mockPrisma.voucher.update).not.toHaveBeenCalled();
  });

  it('soft-disables vouchers that already have redemptions', async () => {
    mockPrisma.voucher.findUnique.mockResolvedValue({
      id: 'v2',
      usageCount: 2,
      _count: { redemptions: 2 },
    });
    mockPrisma.voucher.update.mockResolvedValue({
      id: 'v2',
      isActive: false,
      _count: { redemptions: 2 },
    });

    const result = await deleteOrDisableVoucherAdmin('v2');

    expect(result.action).toBe('disabled');
    expect(mockPrisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v2' },
        data: { isActive: false },
      }),
    );
    expect(mockPrisma.voucher.delete).not.toHaveBeenCalled();
  });

  it('throws when voucher is missing', async () => {
    mockPrisma.voucher.findUnique.mockResolvedValue(null);
    await expect(deleteOrDisableVoucherAdmin('missing')).rejects.toThrow(AppError);
  });
});
