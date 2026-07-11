import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { UserRole } from '#prisma';

const questionSelect = {
  id: true,
  productId: true,
  question: true,
  answer: true,
  answeredAt: true,
  createdAt: true,
  asker: {
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
    },
  },
  answeredBy: {
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
    },
  },
} as const;

export const listProductQuestions = async (productId: string, page = 1, limit = 10) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, status: true },
  });
  if (!product || product.status === 'DELETED') {
    throw new AppError('Produk tidak ditemukan.', 404);
  }

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.productQuestion.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: questionSelect,
    }),
    prisma.productQuestion.count({ where: { productId } }),
  ]);

  return {
    data: rows,
    meta: { total, page, limit },
  };
};

export const askProductQuestion = async (askerId: string, productId: string, question: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, userId: true, status: true, name: true },
  });
  if (!product || product.status === 'DELETED') {
    throw new AppError('Produk tidak ditemukan.', 404);
  }
  if (product.status !== 'ACTIVE') {
    throw new AppError('Produk tidak aktif — pertanyaan tidak dapat dikirim.', 400);
  }
  if (product.userId === askerId) {
    throw new AppError('Supplier tidak dapat mengajukan pertanyaan pada produk sendiri.', 400);
  }

  return prisma.productQuestion.create({
    data: {
      productId,
      askerId,
      question: question.trim(),
    },
    select: questionSelect,
  });
};

export const answerProductQuestion = async (
  supplierId: string,
  questionId: string,
  answer: string,
  role: UserRole,
) => {
  const row = await prisma.productQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      answer: true,
      product: { select: { userId: true, name: true } },
    },
  });
  if (!row) throw new AppError('Pertanyaan tidak ditemukan.', 404);
  if (role !== UserRole.ADMIN && row.product.userId !== supplierId) {
    throw new AppError('Hanya pemilik produk yang dapat menjawab pertanyaan ini.', 403);
  }
  if (row.answer) {
    throw new AppError('Pertanyaan ini sudah dijawab.', 409);
  }

  return prisma.productQuestion.update({
    where: { id: questionId },
    data: {
      answer: answer.trim(),
      answeredAt: new Date(),
      answeredById: supplierId,
    },
    select: questionSelect,
  });
};
