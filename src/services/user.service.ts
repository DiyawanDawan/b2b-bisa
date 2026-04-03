import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { transformAddress } from '#utils/transformer.util';
import { UserRole, UserStatus, ProductStatus, Prisma } from '#prisma';

const addressSelect: Prisma.AddressSelect = {
  fullAddress: true,
  zipCode: true,
  latitude: true,
  longitude: true,
  countryId: true,
  provinceId: true,
  regencyId: true,
  districtId: true,
  villageId: true,
  country: { select: { name: true } },
  province: { select: { name: true } },
  regency: { select: { name: true } },
  district: { select: { name: true } },
  village: { select: { name: true } },
};

/**
 * Get user public profile by ID
 */
export const getUserById = async (id: string, isAuthorized: boolean = false) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      role: true,
      avatarUrl: true,
      province: true,
      regency: true,
      tier: true,
      ...(isAuthorized && { email: true, phone: true }), // Expose contacts if logged in
      verification: { select: { isVerified: true } },
      profile: {
        select: {
          bio: true,
          companyName: true,
          businessType: true,
          website: true,
        },
      },
      createdAt: true,
    },
  });

  if (!user) throw new AppError('User tidak ditemukan.', 404);
  return user;
};

// ─── Customer Address Logic ────────────────────────────

export const listAddresses = async (userId: string, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const [addresses, total] = await prisma.$transaction([
    prisma.customerAddress.findMany({
      where: { userId },
      include: { address: { select: addressSelect } },
      skip,
      take: limit,
      orderBy: { id: 'desc' },
    }),
    prisma.customerAddress.count({ where: { userId } }),
  ]);

  return {
    addresses: addresses.map(transformAddress),
    total,
  };
};

export const createAddress = async (
  userId: string,
  data: {
    label: string;
    countryId: string;
    provinceId?: string;
    regencyId?: string;
    districtId?: string;
    villageId?: string;
    fullAddress: string;
    zipCode: string;
    latitude?: number;
    longitude?: number;
  },
) => {
  const {
    label,
    countryId,
    provinceId,
    regencyId,
    districtId,
    villageId,
    fullAddress,
    zipCode,
    latitude,
    longitude,
  } = data;

  const created = await prisma.customerAddress.create({
    data: {
      user: { connect: { id: userId } },
      label,
      address: {
        create: {
          country: { connect: { id: countryId } },
          province: provinceId ? { connect: { id: provinceId } } : undefined,
          regency: regencyId ? { connect: { id: regencyId } } : undefined,
          district: districtId ? { connect: { id: districtId } } : undefined,
          village: villageId ? { connect: { id: villageId } } : undefined,
          fullAddress,
          zipCode,
          latitude: latitude || 0,
          longitude: longitude || 0,
        },
      },
    },
    include: { address: { select: addressSelect } },
  });

  return transformAddress(created);
};

export const updateAddress = async (
  id: string,
  userId: string,
  data: {
    label?: string;
    countryId?: string;
    provinceId?: string;
    regencyId?: string;
    districtId?: string;
    villageId?: string;
    fullAddress?: string;
    zipCode?: string;
    latitude?: number;
    longitude?: number;
  },
) => {
  const existing = await prisma.customerAddress.findFirst({
    where: { id, userId },
  });

  if (!existing) throw new AppError('Alamat tidak ditemukan.', 404);

  const updated = await prisma.customerAddress.update({
    where: { id },
    data: {
      label: data.label,
      address: {
        update: {
          fullAddress: data.fullAddress,
          zipCode: data.zipCode,
          latitude: data.latitude,
          longitude: data.longitude,
          ...(data.countryId && { country: { connect: { id: data.countryId } } }),
          ...(data.provinceId && { province: { connect: { id: data.provinceId } } }),
          ...(data.regencyId && { regency: { connect: { id: data.regencyId } } }),
          ...(data.districtId && { district: { connect: { id: data.districtId } } }),
          ...(data.villageId && { village: { connect: { id: data.villageId } } }),
        },
      },
    },
    include: { address: { select: addressSelect } },
  });

  return transformAddress(updated);
};

export const deleteAddress = async (id: string, userId: string) => {
  const existing = await prisma.customerAddress.findFirst({
    where: { id, userId },
  });

  if (!existing) throw new AppError('Alamat tidak ditemukan.', 404);

  // We use a transaction to ensure both are deleted
  return prisma.$transaction(async (tx) => {
    await tx.customerAddress.delete({ where: { id } });
    await tx.address.delete({ where: { id: existing.addressId } });
  });
};

// ─── Operating Hours Logic ───────────────────────────

export const listOperatingHours = async (userId: string) => {
  return prisma.operatingHour.findMany({
    where: { userId },
    orderBy: { dayOfWeek: 'asc' },
  });
};

export const updateOperatingHours = async (
  userId: string,
  hours: {
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed?: boolean;
  }[],
) => {
  // We use a transaction to replace old hours with new ones or upsert them.
  // Simplest way for bulk update:
  return prisma.$transaction(async (tx) => {
    // Delete existing hours first (optional, but ensures only provided hours exist)
    await tx.operatingHour.deleteMany({ where: { userId } });

    // Create new hours
    return tx.operatingHour.createMany({
      data: hours.map((h) => ({
        userId,
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isClosed: h.isClosed || false,
      })),
    });
  });
};

/**
 * List verified suppliers for public directory
 */
export const listSuppliers = async (
  filters: {
    province?: string;
    regency?: string;
    page?: number;
    limit?: number;
  },
  isAuthorized: boolean = false,
) => {
  const { province, regency, page = 1, limit = 10 } = filters;
  const skip = (page - 1) * limit;

  const where = {
    role: UserRole.SUPPLIER,
    status: UserStatus.ACTIVE,
    ...(province && { province }),
    ...(regency && { regency }),
  };

  const [suppliers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        province: true,
        regency: true,
        tier: true,
        ...(isAuthorized && { email: true, phone: true }), // Expose contacts if logged in
        profile: { select: { companyName: true, businessType: true } },
        verification: { select: { isVerified: true } },
        _count: { select: { products: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return { suppliers, total };
};

/**
 * Get deep supplier detail including products
 */
export const getSupplierDetail = async (id: string, isAuthorized: boolean = false) => {
  const supplier = await prisma.user.findUnique({
    where: { id, role: UserRole.SUPPLIER },
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
      province: true,
      regency: true,
      tier: true,
      ...(isAuthorized && { email: true, phone: true }), // Expose contacts if logged in
      profile: { select: { bio: true, companyName: true, businessType: true, website: true } },
      verification: { select: { isVerified: true, reviewedAt: true } },
      products: {
        where: { status: ProductStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          pricePerUnit: true,
          unit: true,
          thumbnailUrl: true,
        },
        take: 5,
      },
      _count: { select: { products: true } },
    },
  });

  if (!supplier) throw new AppError('Supplier tidak ditemukan.', 404);
  return supplier;
};
