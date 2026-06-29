import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { OrderStatus, UserRole } from '#prisma';

const COMPLETED_STATUSES: OrderStatus[] = [OrderStatus.COMPLETED, OrderStatus.SHIPPED];
const CANCELLED_STATUSES: OrderStatus[] = [OrderStatus.CANCELLED];

export const getSupplierTradeStats = async (supplierId: string) => {
  const supplier = await prisma.user.findUnique({
    where: { id: supplierId },
    select: { id: true, role: true, createdAt: true },
  });
  if (!supplier || supplier.role !== UserRole.SUPPLIER) {
    throw new AppError('Supplier tidak ditemukan.', 404);
  }

  const statusCounts = await prisma.order.groupBy({
    by: ['status'],
    where: { sellerId: supplierId },
    _count: { _all: true },
  });

  let completedOrders = 0;
  let cancelledOrders = 0;
  let totalOrders = 0;
  for (const row of statusCounts) {
    const count = row._count._all;
    totalOrders += count;
    if (COMPLETED_STATUSES.includes(row.status)) completedOrders += count;
    if (CANCELLED_STATUSES.includes(row.status)) cancelledOrders += count;
  }

  const decided = completedOrders + cancelledOrders;
  const completionRate =
    decided > 0 ? Math.round((completedOrders / decided) * 1000) / 10 : null;

  const negotiations = await prisma.negotiation.findMany({
    where: { sellerId: supplierId },
    select: {
      id: true,
      createdAt: true,
      messages: {
        where: { senderId: supplierId, isSystemMessage: false },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { createdAt: true },
      },
    },
    take: 200,
    orderBy: { createdAt: 'desc' },
  });

  const responseHours: number[] = [];
  for (const n of negotiations) {
    const first = n.messages[0];
    if (!first) continue;
    const diffMs = first.createdAt.getTime() - n.createdAt.getTime();
    if (diffMs >= 0) responseHours.push(diffMs / (1000 * 60 * 60));
  }

  const avgResponseHours =
    responseHours.length > 0
      ? Math.round(
          (responseHours.reduce((a, b) => a + b, 0) / responseHours.length) * 10,
        ) / 10
      : null;

  return {
    supplierId,
    totalTransactions: totalOrders,
    completedOrders,
    completionRate,
    avgResponseHours,
    memberSince: supplier.createdAt,
  };
};
