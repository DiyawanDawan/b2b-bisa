import {
  evaluateBuyerCommerceReadiness,
  evaluateSupplierStoreReadiness,
  assertBuyerCommerceReady,
  assertSupplierStoreReady,
  READINESS_MESSAGES,
  readinessGatesEnabled,
} from '../../src/utils/readiness.util';
import AppError from '../../src/utils/appError';

jest.mock('../../src/config/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

import prisma from '../../src/config/prisma';

const mockFindUnique = prisma.user.findUnique as jest.Mock;

const completeSupplier = {
  id: 'sup-1',
  role: 'SUPPLIER',
  fullName: 'Toko ABC',
  phone: '081234567890',
  province: 'Jawa Barat',
  regency: 'Bandung',
  address: null,
  profile: {
    companyName: 'Toko ABC',
    rajaongkirOriginId: 123,
    address: {
      fullAddress: 'Jl. Merdeka No. 10, Bandung',
      phoneNumber: '081234567890',
      province: { name: 'Jawa Barat' },
      regency: { name: 'Bandung' },
    },
  },
  verification: null,
  customerAddresses: [],
};

const completeBuyer = {
  id: 'buy-1',
  role: 'BUYER',
  fullName: 'Pembeli Satu',
  phone: '081987654321',
  province: 'Jawa Timur',
  regency: 'Surabaya',
  address: null,
  profile: null,
  verification: null,
  customerAddresses: [
    {
      address: {
        fullAddress: 'Jl. Pahlawan No. 5, Surabaya',
        phoneNumber: '081987654321',
        province: { name: 'Jawa Timur' },
        regency: { name: 'Surabaya' },
      },
    },
  ],
};

describe('readiness.util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.READINESS_GATES_ENABLED = 'true';
    process.env.READINESS_ENFORCE_ADMIN = 'false';
    process.env.REQUIRE_KYC_FOR_ACTIVE_PRODUCT = 'false';
  });

  it('supplier ready when all store fields present', async () => {
    mockFindUnique.mockResolvedValue(completeSupplier);
    const result = await evaluateSupplierStoreReadiness('sup-1');
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('supplier missing companyName', async () => {
    mockFindUnique.mockResolvedValue({
      ...completeSupplier,
      profile: {
        ...completeSupplier.profile,
        companyName: '',
      },
      verification: null,
    });
    const result = await evaluateSupplierStoreReadiness('sup-1');
    expect(result.ready).toBe(false);
    expect(result.missing).toContain('companyName');
  });

  it('supplier missing rajaongkirOriginId', async () => {
    mockFindUnique.mockResolvedValue({
      ...completeSupplier,
      profile: {
        ...completeSupplier.profile,
        rajaongkirOriginId: null,
      },
    });
    const result = await evaluateSupplierStoreReadiness('sup-1');
    expect(result.missing).toContain('rajaongkirOriginId');
  });

  it('supplier missing kycVerified when REQUIRE_KYC_FOR_ACTIVE_PRODUCT=true', async () => {
    process.env.REQUIRE_KYC_FOR_ACTIVE_PRODUCT = 'true';
    mockFindUnique.mockResolvedValue({
      ...completeSupplier,
      verification: { businessName: 'Toko ABC', businessAddress: 'Jl. Merdeka', isVerified: false },
    });
    const result = await evaluateSupplierStoreReadiness('sup-1');
    expect(result.ready).toBe(false);
    expect(result.missing).toContain('kycVerified');
  });

  it('supplier kycVerified passes when verified and flag on', async () => {
    process.env.REQUIRE_KYC_FOR_ACTIVE_PRODUCT = 'true';
    mockFindUnique.mockResolvedValue({
      ...completeSupplier,
      verification: { businessName: 'Toko ABC', businessAddress: 'Jl. Merdeka', isVerified: true },
    });
    const result = await evaluateSupplierStoreReadiness('sup-1');
    expect(result.missing).not.toContain('kycVerified');
  });

  it('buyer ready with saved address', async () => {
    mockFindUnique.mockResolvedValue(completeBuyer);
    const result = await evaluateBuyerCommerceReadiness('buy-1');
    expect(result.ready).toBe(true);
  });

  it('buyer missing shipping address', async () => {
    mockFindUnique.mockResolvedValue({
      ...completeBuyer,
      customerAddresses: [],
      address: null,
    });
    const result = await evaluateBuyerCommerceReadiness('buy-1');
    expect(result.missing).toContain('shippingAddress');
  });

  it('assertSupplierStoreReady throws STORE_NOT_READY', async () => {
    mockFindUnique
      .mockResolvedValueOnce({ role: 'SUPPLIER' })
      .mockResolvedValueOnce({
        ...completeSupplier,
        profile: { ...completeSupplier.profile, rajaongkirOriginId: null },
      });

    await expect(assertSupplierStoreReady('sup-1')).rejects.toMatchObject({
      statusCode: 422,
      code: 'STORE_NOT_READY',
      missing: expect.arrayContaining(['rajaongkirOriginId']),
    });
  });

  it('assertBuyerCommerceReady throws BUYER_NOT_READY', async () => {
    mockFindUnique.mockResolvedValue({
      ...completeBuyer,
      customerAddresses: [],
      address: null,
    });

    await expect(assertBuyerCommerceReady('buy-1')).rejects.toMatchObject({
      statusCode: 422,
      code: 'BUYER_NOT_READY',
    });
  });

  it('readiness gates can be disabled via env', async () => {
    process.env.READINESS_GATES_ENABLED = 'false';
    mockFindUnique.mockResolvedValue({
      ...completeBuyer,
      customerAddresses: [],
    });

    await expect(assertBuyerCommerceReady('buy-1')).resolves.toBeUndefined();
    expect(readinessGatesEnabled()).toBe(false);
  });

  it('maps human-readable messages for all keys', () => {
    expect(READINESS_MESSAGES.companyName).toContain('toko');
    expect(READINESS_MESSAGES.shippingAddress).toContain('Alamat');
  });
});
