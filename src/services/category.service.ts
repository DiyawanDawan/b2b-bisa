import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { BiomassaType, CATEGORY_TYPE, ProductMode } from '#prisma';
import { CACHE_TTL } from '#constants/cache.constants';
import { cacheAside, cacheKeys } from '#utils/cache.util';

export type ListCategoriesParams = {
  type?: CATEGORY_TYPE;
  productMode?: ProductMode;
  biomassaType?: BiomassaType;
  search?: string;
};

const fetchCategories = async ({
  type,
  productMode,
  biomassaType,
  search,
}: ListCategoriesParams = {}) => {
  const q = search?.trim();

  return prisma.category.findMany({
    where: {
      ...(type && { categoryType: type }),
      ...(productMode && { productMode }),
      ...(biomassaType && { biomassaType }),
      ...(q && {
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
        ],
      }),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      categoryType: true,
      productMode: true,
      biomassaType: true,
      _count: {
        select: { products: true, articles: true, forumPosts: true },
      },
    },
  });
};

/**
 * List categories with optional type, productMode, biomassaType, and search filter.
 */
export const listCategories = async (params: ListCategoriesParams = {}) =>
  cacheAside(cacheKeys.categoryList(params as Record<string, unknown>), CACHE_TTL.CATEGORY, () =>
    fetchCategories(params),
  );

const fetchCategoryById = async (id: string) => {
  const category = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      categoryType: true,
      productMode: true,
      biomassaType: true,
      _count: {
        select: { products: true },
      },
    },
  });

  if (!category) throw new AppError('Kategori tidak ditemukan.', 404);
  return category;
};

export const getCategoryById = async (id: string) =>
  cacheAside(cacheKeys.categoryById(id), CACHE_TTL.CATEGORY, () => fetchCategoryById(id));
