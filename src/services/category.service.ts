import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { BiomassaType, CATEGORY_TYPE, ProductMode } from '#prisma';

export type ListCategoriesParams = {
  type?: CATEGORY_TYPE;
  productMode?: ProductMode;
  biomassaType?: BiomassaType;
  search?: string;
};

/**
 * List categories with optional type, productMode, biomassaType, and search filter.
 * Biomass categories require biomassaType — organic categories ignore it.
 */
export const listCategories = async ({
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
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
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
 * Get category detail by ID
 */
export const getCategoryById = async (id: string) => {
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
