import prisma from '#config/prisma';
import { BiomassaType, UserStatus, ProductStatus } from '#prisma';
import AppError from '#utils/appError';

/**
 * Get distribution of biomass waste potential across regions
 */
export const getWasteDistributionMap = async (filters: {
  province?: string;
  type?: BiomassaType;
}) => {
  return prisma.wasteData.findMany({
    where: {
      ...(filters.province && { province: filters.province }),
      ...(filters.type && { biomassaType: filters.type }),
    },
    orderBy: { volumeTon: 'desc' },
  });
};

/**
 * Supply-Demand Matching Logic
 * Find top suppliers for a specific type/region
 */
export const matchSupplyDemand = async (type: BiomassaType, regency?: string) => {
  return prisma.user.findMany({
    where: {
      role: 'SUPPLIER',
      status: UserStatus.ACTIVE,
      ...(regency && { regency }),
      products: {
        some: {
          biomassaType: type,
          status: ProductStatus.ACTIVE,
          stock: { gt: 0 },
        },
      },
    },
    select: {
      id: true,
      fullName: true,
      province: true,
      regency: true,
      products: {
        where: { biomassaType: type, status: ProductStatus.ACTIVE },
        select: { name: true, stock: true, pricePerUnit: true },
      },
    },
  });
};

/**
 * Get regions based on level and parentId
 */
export const getRegions = async (level: string, parentId?: string, search?: string) => {
  const select = { id: true, name: true };
  const where: {
    name?: { contains: string };
    countryId?: string;
    provinceId?: string;
    regencyId?: string;
    districtId?: string;
  } = {};
  if (search) where.name = { contains: search };

  switch (level.toLowerCase()) {
    case 'country':
      return prisma.country.findMany({ where, select });

    case 'province':
      if (parentId) where.countryId = parentId;
      return prisma.province.findMany({ where, select });

    case 'regency':
      if (parentId) where.provinceId = parentId;
      return prisma.regency.findMany({ where, select });

    case 'district':
      if (parentId) where.regencyId = parentId;
      return prisma.district.findMany({ where, select });

    case 'village':
      if (parentId) where.districtId = parentId;
      return prisma.village.findMany({ where, select });

    default:
      throw new AppError('Level wilayah tidak valid.', 400);
  }
};
