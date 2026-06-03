import prisma from '#config/prisma';
import { PostStatus, Prisma } from '#prisma';
import AppError from '#utils/appError';

const articleSelect = {
  id: true,
  title: true,
  content: true,
  categoryId: true,
  imageUrl: true,
  status: true,
  authorId: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  author: { select: { id: true, fullName: true } },
};

export const listArticles = async (
  params: {
    page: number;
    limit: number;
    status?: PostStatus;
    search?: string;
    categoryId?: string;
  },
  isAdmin = false,
) => {
  const { page, limit, status, search, categoryId } = params;
  const skip = (page - 1) * limit;

  // If not admin, strictly only show PUBLISHED articles
  const finalStatus = isAdmin ? status : PostStatus.PUBLISHED;

  const where: Prisma.ArticleWhereInput = {
    ...(finalStatus && { status: finalStatus }),
    ...(categoryId && { categoryId }),
    ...(search && {
      OR: [{ title: { contains: search } }, { content: { contains: search } }],
    }),
  };

  const [articles, total] = await prisma.$transaction([
    prisma.article.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true } },
        author: { select: { id: true, fullName: true } },
      },
    }),
    prisma.article.count({ where }),
  ]);

  return { articles, total, totalPages: Math.ceil(total / limit) };
};

export const getArticleById = async (id: string, isAdmin = false) => {
  const article = await prisma.article.findUnique({
    where: { id },
    select: articleSelect,
  });

  if (!article) throw new AppError('Artikel tidak ditemukan', 404);

  // If not admin and article is not published, hide it
  if (!isAdmin && article.status !== PostStatus.PUBLISHED) {
    throw new AppError('Artikel tidak ditemukan', 404);
  }

  return article;
};

export const createArticle = async (data: Prisma.ArticleCreateInput) => {
  const createArticleData = { ...data };

  if (createArticleData.status === PostStatus.PUBLISHED && !createArticleData.publishedAt) {
    createArticleData.publishedAt = new Date();
  }

  return prisma.article.create({
    data: createArticleData,
    select: articleSelect,
  });
};

export const updateArticle = async (id: string, data: Prisma.ArticleUpdateInput) => {
  const existing = await getArticleById(id);
  const updateArticleData = { ...data };

  if (
    updateArticleData.status === PostStatus.PUBLISHED &&
    existing.status !== PostStatus.PUBLISHED &&
    !updateArticleData.publishedAt
  ) {
    updateArticleData.publishedAt = new Date();
  }

  return prisma.article.update({
    where: { id },
    data: updateArticleData,
    select: articleSelect,
  });
};

export const deleteArticle = async (id: string) => {
  await getArticleById(id, true); // Admin check bypass
  return prisma.article.update({
    where: { id },
    data: { status: PostStatus.ARCHIVED },
  });
};
