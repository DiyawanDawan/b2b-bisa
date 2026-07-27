import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { BiomassaType, CATEGORY_TYPE, ProductMode, Prisma } from '#prisma';
import { CACHE_TTL } from '#constants/cache.constants';
import { cacheAside, cacheKeys } from '#utils/cache.util';

export type ListCategoriesParams = {
  type?: CATEGORY_TYPE;
  productMode?: ProductMode;
  biomassaType?: BiomassaType;
  search?: string;
  /** When true (default for PRODUK), only return leaf categories (level 3). */
  leavesOnly?: boolean;
  parentId?: string | null;
};

const categorySelect = {
  id: true,
  name: true,
  description: true,
  categoryType: true,
  productMode: true,
  biomassaType: true,
  level: true,
  parentId: true,
  _count: {
    select: { products: true, articles: true, forumPosts: true, children: true },
  },
} satisfies Prisma.CategorySelect;

export type CategoryNode = {
  id: string;
  name: string;
  description: string | null;
  categoryType: CATEGORY_TYPE;
  productMode: ProductMode | null;
  biomassaType: BiomassaType | null;
  level: number;
  parentId: string | null;
  children: CategoryNode[];
};

const fetchCategories = async ({
  type,
  productMode,
  biomassaType,
  search,
  leavesOnly,
  parentId,
}: ListCategoriesParams = {}) => {
  const q = search?.trim();
  const onlyLeaves = leavesOnly === true;

  return prisma.category.findMany({
    where: {
      isActive: true,
      ...(type && { categoryType: type }),
      ...(productMode && {
        OR: [{ productMode }, { productMode: null, level: { in: [1, 2] } }],
      }),
      ...(biomassaType && {
        OR: [{ biomassaType }, { biomassaType: null, level: { in: [1, 2] } }],
      }),
      ...(parentId !== undefined && { parentId }),
      ...(onlyLeaves && { level: 3 }),
      ...(q && {
        OR: [{ name: { contains: q } }, { description: { contains: q } }],
      }),
    },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    select: categorySelect,
  });
};

/**
 * List categories with optional type, productMode, biomassaType, and search filter.
 * PRODUK lists default to leaf (level 3) rows for product assignment / filters.
 */
export const listCategories = async (params: ListCategoriesParams = {}) =>
  cacheAside(cacheKeys.categoryList(params as Record<string, unknown>), CACHE_TTL.CATEGORY, () =>
    fetchCategories(params),
  );

const fetchCategoryById = async (id: string) => {
  const category = await prisma.category.findUnique({
    where: { id },
    select: {
      ...categorySelect,
      parent: {
        select: {
          id: true,
          name: true,
          level: true,
          parent: { select: { id: true, name: true, level: true } },
        },
      },
    },
  });

  if (!category) throw new AppError('Kategori tidak ditemukan.', 404);
  return category;
};

export const getCategoryById = async (id: string) =>
  cacheAside(cacheKeys.categoryById(id), CACHE_TTL.CATEGORY, () => fetchCategoryById(id));

const buildTree = (
  rows: Array<{
    id: string;
    name: string;
    description: string | null;
    categoryType: CATEGORY_TYPE;
    productMode: ProductMode | null;
    biomassaType: BiomassaType | null;
    level: number;
    parentId: string | null;
  }>,
): CategoryNode[] => {
  const map = new Map<string, CategoryNode>();
  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      description: row.description,
      categoryType: row.categoryType,
      productMode: row.productMode,
      biomassaType: row.biomassaType,
      level: row.level,
      parentId: row.parentId,
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else if (!node.parentId || node.level === 1) {
      roots.push(node);
    }
  }

  const sortRec = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'id'));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
};

/**
 * Nested L1 → L2 → L3 category tree for product pickers.
 */
export const getCategoryTree = async (
  params: {
    type?: CATEGORY_TYPE;
    productMode?: ProductMode;
    biomassaType?: BiomassaType;
  } = {},
) => {
  const type = params.type ?? CATEGORY_TYPE.PRODUK;
  return cacheAside(
    cacheKeys.categoryList({ ...params, tree: true } as Record<string, unknown>),
    CACHE_TTL.CATEGORY,
    async () => {
      const rows = await prisma.category.findMany({
        where: {
          isActive: true,
          categoryType: type,
          ...(params.productMode && { productMode: params.productMode }),
          ...(params.biomassaType && {
            OR: [
              { biomassaType: params.biomassaType },
              { biomassaType: null, level: { in: [1, 2] } },
            ],
          }),
        },
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          categoryType: true,
          productMode: true,
          biomassaType: true,
          level: true,
          parentId: true,
        },
      });
      return buildTree(rows);
    },
  );
};
