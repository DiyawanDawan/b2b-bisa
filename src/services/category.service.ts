import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { CATEGORY_TYPE } from '#prisma';

/**
 * List categories with optional type filter
 */
export const listCategories = async (type?: CATEGORY_TYPE) => {
  return prisma.category.findMany({
    where: {
      ...(type && { categoryType: type }),
    },
    orderBy: { name: 'asc' },
    include: {
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
    include: {
      _count: {
        select: { products: true },
      },
    },
  });

  if (!category) throw new AppError('Kategori tidak ditemukan.', 404);
  return category;
};
