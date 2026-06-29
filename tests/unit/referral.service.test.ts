const referralReward = {
  upsert: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};
const wallet = { upsert: jest.fn() };
const user = {
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};

jest.mock('#config/prisma', () => ({
  __esModule: true,
  default: {
    user,
    referralReward,
    wallet,
    $transaction: jest.fn((fn: (tx: typeof referralReward & { wallet: typeof wallet }) => unknown) =>
      fn({ referralReward, wallet } as never),
    ),
  },
}));

import { Prisma, ReferralRewardStatus } from '#prisma';
import {
  REFERRAL_COMMISSION_IDR,
  applyReferralOnRegister,
  creditReferralOnFirstPaidOrder,
  validateReferralCode,
} from '../../src/services/referral.service';

describe('referral.service (FB-20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validateReferralCode returns invalid for unknown code', async () => {
    user.findFirst.mockResolvedValue(null);
    const result = await validateReferralCode('UNKNOWN');
    expect(result.valid).toBe(false);
  });

  it('validateReferralCode returns referrer for active code', async () => {
    user.findFirst.mockResolvedValue({
      id: 'ref-1',
      fullName: 'Referrer',
      referralCode: 'BISA-ABC123',
    });
    const result = await validateReferralCode('bisa-abc123');
    expect(result.valid).toBe(true);
    expect(result.referrerId).toBe('ref-1');
  });

  it('applyReferralOnRegister skips self-referral', async () => {
    user.findFirst.mockResolvedValue({
      id: 'same-user',
      fullName: 'Self',
      referralCode: 'BISA-SELF',
    });

    const result = await applyReferralOnRegister('same-user', 'BISA-SELF');
    expect(result).toBeNull();
    expect(user.update).not.toHaveBeenCalled();
  });

  it('applyReferralOnRegister links referrer and creates reward', async () => {
    user.findFirst.mockResolvedValue({
      id: 'ref-1',
      fullName: 'Referrer',
      referralCode: 'BISA-REF1',
    });
    user.update.mockResolvedValue({});
    referralReward.upsert.mockResolvedValue({});

    const result = await applyReferralOnRegister('new-user', 'BISA-REF1');
    expect(result?.valid).toBe(true);
    expect(referralReward.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          referrerId: 'ref-1',
          referredUserId: 'new-user',
          amount: new Prisma.Decimal(REFERRAL_COMMISSION_IDR),
          status: ReferralRewardStatus.PENDING,
        }),
      }),
    );
  });

  it('creditReferralOnFirstPaidOrder credits wallet once', async () => {
    referralReward.findUnique.mockResolvedValue({
      id: 'rw-1',
      referrerId: 'ref-1',
      status: ReferralRewardStatus.PENDING,
      orderId: null,
      amount: new Prisma.Decimal(REFERRAL_COMMISSION_IDR),
    });
    referralReward.update.mockResolvedValue({});
    wallet.upsert.mockResolvedValue({});

    await creditReferralOnFirstPaidOrder('order-1', 'buyer-1');

    expect(referralReward.update).toHaveBeenCalled();
    expect(wallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'ref-1' },
      }),
    );
  });
});
