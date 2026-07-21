import prisma from '#config/prisma';
import AppError from '#utils/appError';
import {
  NegotiationRoomType,
  NegotiationStatus,
  NotificationType,
  Prisma,
  ProductMode,
  ProductStatus,
  RfqStatus,
  UserRole,
  VerificationStatus,
} from '#prisma';
import { createNotification } from '#services/notification.service';

const rfqSelect = {
  id: true,
  title: true,
  productMode: true,
  biomassaType: true,
  categoryId: true,
  quantity: true,
  specifications: true,
  deliveryDate: true,
  budgetMax: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  buyer: { select: { id: true, fullName: true, avatarUrl: true } },
  category: { select: { id: true, name: true } },
  responses: {
    select: {
      id: true,
      supplierId: true,
      negotiationId: true,
      message: true,
      createdAt: true,
      supplier: { select: { id: true, fullName: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
};

const findMatchingSupplierIds = async (rfq: {
  productMode: ProductMode;
  biomassaType: string | null;
  categoryId: string | null;
}) => {
  const productWhere: Prisma.ProductWhereInput = {
    status: ProductStatus.ACTIVE,
    productMode: rfq.productMode,
    user: {
      role: UserRole.SUPPLIER,
      status: 'ACTIVE',
      verification: { verificationStatus: VerificationStatus.VERIFIED },
    },
  };
  if (rfq.biomassaType) {
    productWhere.biomassaType = rfq.biomassaType as any;
  }
  if (rfq.categoryId) {
    productWhere.categoryId = rfq.categoryId;
  }

  const products = await prisma.product.findMany({
    where: productWhere,
    select: { userId: true },
    distinct: ['userId'],
    take: 50,
  });
  return products.map((p) => p.userId);
};

export const createRfq = async (
  buyerId: string,
  data: {
    title: string;
    productMode: ProductMode;
    biomassaType?: string;
    categoryId?: string;
    quantity: number;
    specifications?: string;
    deliveryDate?: string;
    budgetMax?: number;
  },
) => {
  const rfq = await prisma.rfq.create({
    data: {
      buyerId,
      title: data.title.trim(),
      productMode: data.productMode,
      biomassaType: data.biomassaType as any,
      categoryId: data.categoryId,
      quantity: data.quantity,
      specifications: data.specifications?.trim() || null,
      deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null,
      budgetMax: data.budgetMax != null ? data.budgetMax : null,
      status: RfqStatus.OPEN,
    },
    select: rfqSelect,
  });

  const supplierIds = await findMatchingSupplierIds(rfq);
  await Promise.all(
    supplierIds.map((supplierId) =>
      createNotification({
        userId: supplierId,
        title: 'RFQ baru cocok dengan katalog Anda',
        body: rfq.title,
        type: NotificationType.RFQ,
        refId: rfq.id,
      }),
    ),
  );

  const recipients = await loadRecipientProfiles(supplierIds);
  return {
    ...rfq,
    matchedSuppliers: supplierIds.length,
    recipients,
  };
};

const recipientUserSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
  province: true,
  regency: true,
  profile: { select: { companyName: true, businessType: true } },
  verification: { select: { verificationStatus: true, isVerified: true } },
} as const;

const loadRecipientProfiles = async (supplierIds: string[]) => {
  if (supplierIds.length === 0) return [];
  return prisma.user.findMany({
    where: { id: { in: supplierIds } },
    select: recipientUserSelect,
  });
};

const loadNotifiedRecipients = async (rfqId: string) => {
  const notifs = await prisma.notification.findMany({
    where: { type: NotificationType.RFQ, refId: rfqId },
    orderBy: { createdAt: 'asc' },
    select: {
      userId: true,
      isRead: true,
      createdAt: true,
      user: { select: recipientUserSelect },
    },
  });

  const seen = new Set<string>();
  const recipients: Array<{
    id: string;
    fullName: string;
    avatarUrl: string | null;
    province: string | null;
    regency: string | null;
    profile: { companyName: string | null; businessType: string | null } | null;
    verification: { verificationStatus: VerificationStatus; isVerified: boolean } | null;
    notifiedAt: Date;
    notificationRead: boolean;
  }> = [];

  for (const n of notifs) {
    if (seen.has(n.userId)) continue;
    seen.add(n.userId);
    recipients.push({
      ...n.user,
      notifiedAt: n.createdAt,
      notificationRead: n.isRead,
    });
  }
  return recipients;
};

export const getBuyerRfqDetail = async (buyerId: string, rfqId: string) => {
  const rfq = await prisma.rfq.findFirst({
    where: { id: rfqId, buyerId },
    select: rfqSelect,
  });
  if (!rfq) throw new AppError('RFQ tidak ditemukan.', 404);

  let recipients = await loadNotifiedRecipients(rfqId);
  if (recipients.length === 0) {
    // Fallback: hitung ulang matching (mis. notifikasi belum tercatat)
    const ids = await findMatchingSupplierIds(rfq);
    const profiles = await loadRecipientProfiles(ids);
    recipients = profiles.map((u) => ({
      ...u,
      notifiedAt: rfq.createdAt,
      notificationRead: false,
    }));
  }

  const respondedIds = new Set(rfq.responses.map((r) => r.supplierId));
  return {
    ...rfq,
    matchedSuppliers: recipients.length,
    recipients: recipients.map((r) => ({
      ...r,
      hasResponded: respondedIds.has(r.id),
      response: rfq.responses.find((x) => x.supplierId === r.id) ?? null,
    })),
  };
};

export const listBuyerRfqs = async (buyerId: string, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [items, total] = await prisma.$transaction([
    prisma.rfq.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: rfqSelect,
    }),
    prisma.rfq.count({ where: { buyerId } }),
  ]);
  return { items, total, page, limit };
};

export const listSupplierRfqInbox = async (supplierId: string, page = 1, limit = 20) => {
  const supplierProducts = await prisma.product.findMany({
    where: {
      userId: supplierId,
      status: ProductStatus.ACTIVE,
    },
    select: { productMode: true, biomassaType: true, categoryId: true },
  });

  if (supplierProducts.length === 0) {
    return { items: [], total: 0, page, limit };
  }

  const modes = [...new Set(supplierProducts.map((p) => p.productMode))];
  const biomassaTypes = [
    ...new Set(
      supplierProducts
        .map((p) => p.biomassaType)
        .filter((b): b is NonNullable<typeof b> => b != null),
    ),
  ];
  const categoryIds = [
    ...new Set(supplierProducts.map((p) => p.categoryId).filter((c): c is string => c != null)),
  ];

  const where: Prisma.RfqWhereInput = {
    status: RfqStatus.OPEN,
    productMode: { in: modes },
    OR: [
      { biomassaType: null },
      ...(biomassaTypes.length ? [{ biomassaType: { in: biomassaTypes } }] : []),
    ],
    AND: [
      {
        OR: [
          { categoryId: null },
          ...(categoryIds.length ? [{ categoryId: { in: categoryIds } }] : []),
        ],
      },
    ],
  };

  const skip = (page - 1) * limit;
  const [items, total] = await prisma.$transaction([
    prisma.rfq.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        ...rfqSelect,
        responses: {
          where: { supplierId },
          select: {
            id: true,
            negotiationId: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.rfq.count({ where }),
  ]);

  return { items, total, page, limit };
};

export const getSupplierRfqDetail = async (supplierId: string, rfqId: string) => {
  const rfq = await prisma.rfq.findUnique({
    where: { id: rfqId },
    select: rfqSelect,
  });
  if (!rfq || rfq.status !== RfqStatus.OPEN) {
    throw new AppError('RFQ tidak ditemukan atau sudah ditutup.', 404);
  }

  const matchingProduct = await pickSupplierProductForRfq(supplierId, rfq);
  if (!matchingProduct) {
    throw new AppError('RFQ ini tidak cocok dengan katalog aktif Anda.', 403);
  }

  return {
    ...rfq,
    responses: rfq.responses.filter((response) => response.supplierId === supplierId),
    matchingProduct,
  };
};

const pickSupplierProductForRfq = async (
  supplierId: string,
  rfq: { productMode: ProductMode; biomassaType: string | null; categoryId: string | null },
) => {
  const where: Prisma.ProductWhereInput = {
    userId: supplierId,
    status: ProductStatus.ACTIVE,
    productMode: rfq.productMode,
  };
  if (rfq.biomassaType) where.biomassaType = rfq.biomassaType as any;
  if (rfq.categoryId) where.categoryId = rfq.categoryId;

  return prisma.product.findFirst({
    where,
    orderBy: { totalSold: 'desc' },
    select: { id: true, name: true, pricePerUnit: true, minOrder: true },
  });
};

export const respondToRfq = async (supplierId: string, rfqId: string, message?: string) => {
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
  if (!rfq) throw new AppError('RFQ tidak ditemukan.', 404);
  if (rfq.status !== RfqStatus.OPEN) {
    throw new AppError('RFQ sudah tidak menerima respons.', 400);
  }
  if (rfq.buyerId === supplierId) {
    throw new AppError('Anda tidak dapat merespons RFQ sendiri.', 400);
  }

  const existing = await prisma.rfqResponse.findUnique({
    where: { rfqId_supplierId: { rfqId, supplierId } },
  });
  if (existing?.negotiationId) {
    return prisma.rfqResponse.findUnique({
      where: { id: existing.id },
      include: { negotiation: { select: { id: true, status: true } } },
    });
  }

  const product = await pickSupplierProductForRfq(supplierId, rfq);
  if (!product) {
    throw new AppError('Tidak ada produk aktif yang cocok untuk RFQ ini.', 400);
  }

  const qty = Prisma.Decimal.max(rfq.quantity, product.minOrder);
  const price = product.pricePerUnit;
  const total = qty.mul(price);

  const result = await prisma.$transaction(async (tx) => {
    const negotiation = await tx.negotiation.create({
      data: {
        productId: product.id,
        buyerId: rfq.buyerId,
        sellerId: supplierId,
        quantity: qty,
        pricePerUnit: price,
        totalEstimate: total,
        roomType: NegotiationRoomType.INQUIRY,
        status: NegotiationStatus.OPEN_NEGOTIATION,
        specifications: `RFQ: ${rfq.title}\n${rfq.specifications ?? ''}`.trim(),
      },
    });

    const intro =
      message?.trim() ||
      `Halo, kami bisa memenuhi RFQ "${rfq.title}" dengan produk ${product.name}.`;
    await tx.chatMessage.create({
      data: {
        negotiationId: negotiation.id,
        senderId: supplierId,
        content: intro,
        isSystemMessage: false,
      },
    });

    const response = await tx.rfqResponse.upsert({
      where: { rfqId_supplierId: { rfqId, supplierId } },
      create: {
        rfqId,
        supplierId,
        negotiationId: negotiation.id,
        message: message?.trim() || null,
      },
      update: {
        negotiationId: negotiation.id,
        message: message?.trim() || null,
      },
    });

    await tx.rfq.update({
      where: { id: rfqId },
      data: { status: RfqStatus.MATCHED },
    });

    return { response, negotiation };
  });

  void createNotification({
    userId: rfq.buyerId,
    title: 'Supplier merespons RFQ Anda',
    body: rfq.title,
    type: NotificationType.RFQ,
    refId: result.negotiation.id,
  });

  return result;
};
