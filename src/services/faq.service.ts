import prisma from '#config/prisma';
import { Prisma } from '#prisma';
import AppError from '#utils/appError';

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
  params: { page: number; limit: number; includeInactive?: boolean },
  isAdmin = false,
) => {
  const { page, limit, includeInactive = false } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.FaqWhereInput = isAdmin && includeInactive ? {} : { isActive: true };

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
  return prisma.faq.create({
    data,
    select: faqSelect,
  });
};

export const updateFaq = async (id: string, data: Prisma.FaqUpdateInput) => {
  await getFaqById(id, true);
  return prisma.faq.update({
    where: { id },
    data,
    select: faqSelect,
  });
};

export const deleteFaq = async (id: string) => {
  await getFaqById(id, true);
  return prisma.faq.update({
    where: { id },
    data: { isActive: false },
    select: faqSelect,
  });
};
