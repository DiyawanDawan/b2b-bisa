import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { transformAddress } from '#utils/transformer.util';
import { UserRole, UserStatus, ProductStatus, Prisma } from '#prisma';
import * as storeBannerService from '#services/storeBanner.service';

const addressSelect: Prisma.AddressSelect = {
  fullAddress: true,
  zipCode: true,
  phoneNumber: true,
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
      verification: { select: { isVerified: true, businessName: true, businessAddress: true } },
      profile: {
        select: {
          bio: true,
          companyName: true,
          businessType: true,
          website: true,
        },
      },
      address: { select: addressSelect },
      createdAt: true,
    },
  });

  if (!user) throw new AppError('User tidak ditemukan.', 404);

  if (user.role === UserRole.SUPPLIER) {
    const storeBanners = await storeBannerService.listStoreBanners(id, { activeOnly: true });
    return { ...user, storeBanners };
  }

  return user;
};

// ─── Customer Address Logic ────────────────────────────

export const listAddresses = async (userId: string, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const [addresses, total] = await prisma.$transaction([
    prisma.customerAddress.findMany({
      where: { userId },
      select: {
        id: true,
        label: true,
        isPrimary: true,
        addressId: true,
        address: { select: addressSelect },
      },
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
    phone?: string;
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
          phoneNumber: data.phone || '',
          latitude: latitude || 0,
          longitude: longitude || 0,
        },
      },
    },
    select: {
      id: true,
      label: true,
      isPrimary: true,
      addressId: true,
      address: { select: addressSelect },
    },
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
    phone?: string;
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
          ...(data.fullAddress !== undefined && { fullAddress: data.fullAddress }),
          ...(data.zipCode !== undefined && { zipCode: data.zipCode }),
          ...(data.phone !== undefined && { phoneNumber: data.phone }),
          ...(data.latitude !== undefined && { latitude: data.latitude }),
          ...(data.longitude !== undefined && { longitude: data.longitude }),
          ...(data.countryId && { country: { connect: { id: data.countryId } } }),
          ...(data.provinceId && { province: { connect: { id: data.provinceId } } }),
          ...(data.regencyId && { regency: { connect: { id: data.regencyId } } }),
          ...(data.districtId && { district: { connect: { id: data.districtId } } }),
          ...(data.villageId && { village: { connect: { id: data.villageId } } }),
        },
      },
    },
    select: {
      id: true,
      label: true,
      isPrimary: true,
      addressId: true,
      address: { select: addressSelect },
    },
  });

  return transformAddress(updated);
};

export const deleteAddress = async (id: string, userId: string) => {
  const existing = await prisma.customerAddress.findFirst({
    where: { id, userId },
  });

  if (!existing) throw new AppError('Alamat tidak ditemukan.', 404);

  // We delete the customer address mapping first.
  // We do NOT use a transaction that includes the address deletion
  // because the address might be referenced by historical orders (onDelete: Restrict),
  // and we want the customer address to be removed from the user's list regardless.
  await prisma.customerAddress.delete({ where: { id } });

  try {
    // Attempt to clean up the underlying address record
    await prisma.address.delete({ where: { id: existing.addressId } });
  } catch (error) {
    // If it's referenced by orders, contracts, etc., we just leave it in the DB.
    console.log(
      `Address ${existing.addressId} is still referenced by other entities, keeping for historical records.`,
    );
  }

  return { success: true };
};

export const setDefaultAddress = async (id: string, userId: string) => {
  return prisma.$transaction(async (tx) => {
    // 1. Reset all addresses for this user to NOT primary
    await tx.customerAddress.updateMany({
      where: { userId },
      data: { isPrimary: false },
    });

    // 2. Set the target address as primary
    const updated = await tx.customerAddress.update({
      where: { id },
      data: { isPrimary: true },
      select: {
        id: true,
        label: true,
        isPrimary: true,
        addressId: true,
        address: { select: addressSelect },
      },
    });

    return transformAddress(updated);
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
  const supplier = await prisma.user.findFirst({
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
      verification: {
        select: { isVerified: true, businessName: true, businessAddress: true, reviewedAt: true },
      },
      address: { select: addressSelect },
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
