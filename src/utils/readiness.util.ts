import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { optional } from '#utils/env.util';
import { ensureSupplierShippingOriginFromAddresses } from '#services/order-shipping.service';

export type StoreReadinessKey =
  | 'companyName'
  | 'phone'
  | 'storeLocation'
  | 'businessAddress'
  | 'profileAddress'
  | 'rajaongkirOriginId'
  | 'kycVerified';

export type BuyerReadinessKey = 'shippingAddress' | 'recipientPhone' | 'shippingRegion';

export type ReadinessResult<T extends string> = {
  ready: boolean;
  missing: T[];
};

export const READINESS_MESSAGES: Record<StoreReadinessKey | BuyerReadinessKey, string> = {
  companyName: 'Nama toko / perusahaan belum diisi',
  phone: 'Nomor telepon belum diisi atau tidak valid',
  storeLocation: 'Provinsi dan kabupaten/kota pada Alamat Profil belum lengkap',
  businessAddress: 'Alamat bisnis pada Profil belum diisi (min. 10 karakter)',
  profileAddress:
    'Alamat Profil wajib (UserProfile → Address) lengkap dengan lat/lng — sumber tunggal jarak BISA Express',
  rajaongkirOriginId:
    'Lokasi asal pengiriman RajaOngkir belum terdeteksi dari Alamat Profil. Lengkapi Alamat di Profil.',
  kycVerified: 'Verifikasi KYC belum disetujui — lengkapi di menu Verifikasi',
  shippingAddress: 'Alamat pengiriman belum diisi (min. 10 karakter)',
  recipientPhone: 'Nomor telepon penerima belum diisi (min. 8 digit)',
  shippingRegion: 'Kabupaten/kota atau provinsi tujuan belum diisi',
};

const addressSelect = {
  fullAddress: true,
  phoneNumber: true,
  latitude: true,
  longitude: true,
  province: { select: { name: true } },
  regency: { select: { name: true } },
} as const;

const phoneValid = (value?: string | null) =>
  !!value?.trim() && /^\+?[0-9]{10,15}$/.test(value.trim());

const phoneRecipientValid = (value?: string | null) =>
  !!value?.trim() && value.trim().replace(/\D/g, '').length >= 8;

const textMin = (value?: string | null, min = 2) => !!value?.trim() && value.trim().length >= min;

const loadReadinessUser = async (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      fullName: true,
      phone: true,
      province: true,
      regency: true,
      address: { select: addressSelect },
      profile: {
        select: {
          companyName: true,
          rajaongkirOriginId: true,
          address: { select: addressSelect },
        },
      },
      verification: {
        select: {
          businessName: true,
          businessAddress: true,
          isVerified: true,
        },
      },
      customerAddresses: {
        orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
        take: 1,
        select: {
          address: { select: addressSelect },
        },
      },
    },
  });

const resolveCompanyName = (user: NonNullable<Awaited<ReturnType<typeof loadReadinessUser>>>) =>
  user.profile?.companyName?.trim() || user.verification?.businessName?.trim() || '';

const resolveBusinessAddress = (user: NonNullable<Awaited<ReturnType<typeof loadReadinessUser>>>) =>
  user.profile?.address?.fullAddress?.trim() || '';

const hasProfileAddressComplete = (
  user: NonNullable<Awaited<ReturnType<typeof loadReadinessUser>>>,
) => {
  const addr = user.profile?.address;
  if (!addr) return false;
  if (!textMin(addr.fullAddress, 10)) return false;
  const lat = addr.latitude != null ? Number(addr.latitude) : NaN;
  const lng = addr.longitude != null ? Number(addr.longitude) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return !!(addr.province?.name?.trim() || addr.regency?.name?.trim());
};

const hasStoreLocation = (user: NonNullable<Awaited<ReturnType<typeof loadReadinessUser>>>) => {
  const profileAddr = user.profile?.address;
  if (profileAddr?.province?.name?.trim() && profileAddr.regency?.name?.trim()) {
    return true;
  }
  if (profileAddr?.regency?.name?.trim() || profileAddr?.province?.name?.trim()) {
    return true;
  }
  return false;
};

const resolveBuyerLinkedAddress = (
  user: NonNullable<Awaited<ReturnType<typeof loadReadinessUser>>>,
) => user.customerAddresses[0]?.address ?? user.address ?? null;

export const evaluateSupplierStoreReadiness = async (
  userId: string,
): Promise<ReadinessResult<StoreReadinessKey>> => {
  // Ambil origin ongkir dari alamat toko / Alamat Pengiriman utama bila belum diisi.
  try {
    await ensureSupplierShippingOriginFromAddresses(userId);
  } catch {
    // Best-effort: tetap evaluasi readiness meski lookup RajaOngkir gagal.
  }

  const user = await loadReadinessUser(userId);
  if (!user) {
    return {
      ready: false,
      missing: [
        'companyName',
        'phone',
        'storeLocation',
        'businessAddress',
        'profileAddress',
        'rajaongkirOriginId',
      ],
    };
  }

  const missing: StoreReadinessKey[] = [];

  if (!textMin(resolveCompanyName(user), 2)) {
    missing.push('companyName');
  }
  if (!phoneValid(user.phone)) {
    missing.push('phone');
  }
  if (!hasStoreLocation(user)) {
    missing.push('storeLocation');
  }
  if (!textMin(resolveBusinessAddress(user), 10)) {
    missing.push('businessAddress');
  }
  if (!hasProfileAddressComplete(user)) {
    missing.push('profileAddress');
  }
  if (user.profile?.rajaongkirOriginId == null || user.profile.rajaongkirOriginId <= 0) {
    missing.push('rajaongkirOriginId');
  }
  if (requireKycForActiveProduct() && !user.verification?.isVerified) {
    missing.push('kycVerified');
  }

  return { ready: missing.length === 0, missing };
};

export const evaluateBuyerCommerceReadiness = async (
  userId: string,
): Promise<ReadinessResult<BuyerReadinessKey>> => {
  const user = await loadReadinessUser(userId);
  if (!user) {
    return { ready: false, missing: ['shippingAddress', 'recipientPhone', 'shippingRegion'] };
  }

  const missing: BuyerReadinessKey[] = [];
  const linked = resolveBuyerLinkedAddress(user);
  const addressText = linked?.fullAddress?.trim() ?? '';

  if (addressText.length < 10) {
    missing.push('shippingAddress');
  }

  const recipientPhone = linked?.phoneNumber ?? user.phone;
  if (!phoneRecipientValid(recipientPhone)) {
    missing.push('recipientPhone');
  }

  const hasRegion =
    textMin(linked?.regency?.name, 2) ||
    textMin(linked?.province?.name, 2) ||
    textMin(user.regency, 2) ||
    textMin(user.province, 2);

  if (!hasRegion) {
    missing.push('shippingRegion');
  }

  return { ready: missing.length === 0, missing };
};

export const getUserReadiness = async (userId: string) => {
  const user = await loadReadinessUser(userId);
  if (!user) {
    throw new AppError('User tidak ditemukan.', 404);
  }

  const isSupplier = user.role === 'SUPPLIER' || user.role === 'ADMIN';
  const isBuyer = user.role === 'BUYER' || user.role === 'ADMIN';

  const [store, buyer] = await Promise.all([
    isSupplier ? evaluateSupplierStoreReadiness(userId) : Promise.resolve(null),
    isBuyer ? evaluateBuyerCommerceReadiness(userId) : Promise.resolve(null),
  ]);

  return {
    role: user.role,
    store: store
      ? {
          ready: store.ready,
          missing: store.missing,
          messages: store.missing.map((key) => READINESS_MESSAGES[key]),
        }
      : null,
    buyer: buyer
      ? {
          ready: buyer.ready,
          missing: buyer.missing,
          messages: buyer.missing.map((key) => READINESS_MESSAGES[key]),
        }
      : null,
  };
};

export const readinessGatesEnabled = () =>
  optional('READINESS_GATES_ENABLED', 'true').toLowerCase() !== 'false';

export const requireKycForActiveProduct = () =>
  optional('REQUIRE_KYC_FOR_ACTIVE_PRODUCT', 'false').toLowerCase() === 'true';

const shouldEnforceSupplierGate = async (userId: string) => {
  if (!readinessGatesEnabled()) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return true;

  if (user.role === 'ADMIN') {
    return optional('READINESS_ENFORCE_ADMIN', 'false').toLowerCase() === 'true';
  }

  return user.role === 'SUPPLIER';
};

export const assertSupplierStoreReady = async (userId: string) => {
  if (!(await shouldEnforceSupplierGate(userId))) return;

  const result = await evaluateSupplierStoreReadiness(userId);
  if (result.ready) return;

  const first = result.missing[0];
  throw new AppError(
    first ? READINESS_MESSAGES[first] : 'Lengkapi data toko sebelum menambah produk.',
    422,
    {
      code: 'STORE_NOT_READY',
      missing: result.missing,
    },
  );
};

export const assertBuyerCommerceReady = async (userId: string) => {
  if (!readinessGatesEnabled()) return;

  const result = await evaluateBuyerCommerceReadiness(userId);
  if (result.ready) return;

  const first = result.missing[0];
  throw new AppError(
    first
      ? `${READINESS_MESSAGES[first]} Lengkapi di Profil → Alamat Pengiriman.`
      : 'Lengkapi profil pengiriman sebelum melanjutkan.',
    422,
    {
      code: 'BUYER_NOT_READY',
      missing: result.missing,
    },
  );
};
