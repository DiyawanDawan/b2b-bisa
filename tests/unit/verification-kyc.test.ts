jest.mock('#config/prisma', () => ({
  __esModule: true,
  default: {
    userVerification: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import prisma from '#config/prisma';
import {
  submitVerification,
  updateVerificationStatus,
} from '../../src/services/verification.service';

describe('updateVerificationStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets isVerified true when status is VERIFIED', async () => {
    (prisma.userVerification.findUnique as jest.Mock).mockResolvedValue({
      userId: 'u1',
      verificationStatus: 'PENDING',
    });
    (prisma.userVerification.update as jest.Mock).mockResolvedValue({});

    await updateVerificationStatus('u1', 'VERIFIED', 'admin1');

    expect(prisma.userVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        data: expect.objectContaining({
          verificationStatus: 'VERIFIED',
          isVerified: true,
        }),
      }),
    );
  });

  it('sets isVerified false when status is REJECTED', async () => {
    (prisma.userVerification.findUnique as jest.Mock).mockResolvedValue({
      userId: 'u1',
      verificationStatus: 'PENDING',
    });
    (prisma.userVerification.update as jest.Mock).mockResolvedValue({});

    await updateVerificationStatus('u1', 'REJECTED', 'admin1', 'Dokumen buram');

    expect(prisma.userVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isVerified: false,
          rejectionReason: 'Dokumen buram',
        }),
      }),
    );
  });

  it('resets isVerified false when user resubmits verification docs', async () => {
    (prisma.userVerification.upsert as jest.Mock).mockResolvedValue({});

    await submitVerification('u1', { ktpUrl: 'https://example.com/ktp.jpg' });

    expect(prisma.userVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        update: expect.objectContaining({
          verificationStatus: 'PENDING',
          isVerified: false,
        }),
      }),
    );
  });
});
