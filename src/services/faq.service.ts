import prisma from '#config/prisma';
import { Prisma } from '#prisma';
import AppError from '#utils/appError';
import { CACHE_TTL } from '#constants/cache.constants';
import { cacheAside, cacheKeys, invalidateFaqs } from '#utils/cache.util';

const faqSelect = {
  id: true,
  question: true,
  answer: true,
  order: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FaqSelect;

export const listFaqs = async (
  params: { page: number; limit: number; includeInactive?: boolean; search?: string },
  isAdmin = false,
) => {
  const { page, limit, includeInactive = false, search } = params;
  const skip = (page - 1) * limit;
  const q = search?.trim();

  const where: Prisma.FaqWhereInput = {
    ...(isAdmin && includeInactive ? {} : { isActive: true }),
    ...(q
      ? {
          OR: [{ question: { contains: q } }, { answer: { contains: q } }],
        }
      : {}),
  };

  const load = async () => {
    const [faqs, total] = await prisma.$transaction([
      prisma.faq.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: faqSelect,
      }),
      prisma.faq.count({ where }),
    ]);
    return { faqs, total, totalPages: Math.ceil(total / limit) };
  };

  if (isAdmin || q) {
    return load();
  }

  return cacheAside(cacheKeys.faqList(page, limit), CACHE_TTL.FAQ, load);
};

export const getFaqById = async (id: string, isAdmin = false) => {
  const faq = await prisma.faq.findUnique({
    where: { id },
    select: faqSelect,
  });

  if (!faq) throw new AppError('FAQ tidak ditemukan', 404);
  if (!isAdmin && !faq.isActive) throw new AppError('FAQ tidak ditemukan', 404);

  return faq;
};

export const createFaq = async (data: Prisma.FaqCreateInput) => {
  const created = await prisma.faq.create({
    data,
    select: faqSelect,
  });
  void invalidateFaqs();
  return created;
};

export const updateFaq = async (id: string, data: Prisma.FaqUpdateInput) => {
  await getFaqById(id, true);
  const updated = await prisma.faq.update({
    where: { id },
    data,
    select: faqSelect,
  });
  void invalidateFaqs();
  return updated;
};

export const deleteFaq = async (id: string) => {
  await getFaqById(id, true);
  const deleted = await prisma.faq.update({
    where: { id },
    data: { isActive: false },
    select: faqSelect,
  });
  void invalidateFaqs();
  return deleted;
};
