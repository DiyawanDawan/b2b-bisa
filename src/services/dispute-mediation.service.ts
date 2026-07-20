import prisma from '#config/prisma';
import pusher from '#config/pusher';
import AppError from '#utils/appError';
import {
  Prisma,
  DisputeStatus,
  NotificationPriority,
  NotificationType,
  NegotiationRoomType,
  NegotiationStatus,
  OrderStatus,
  TaxStatus,
  UserRole,
} from '#prisma';
import { createNotification } from '#services/notification.service';
import { attachAdminChatThreadMedia } from '#utils/mediaResolver.util';

export const ADMIN_MEDIATION_PREFIX = '[Admin BISA]';

/** Creates a locked negotiation room for disputed direct-checkout orders (no pre-existing chat). */
export const ensureDisputeNegotiationRoom = async (
  orderId: string,
  tx?: Prisma.TransactionClient,
) => {
  const db = tx ?? prisma;

  const existing = await db.negotiation.findFirst({ where: { orderId } });
  if (existing) return existing;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      orderNumber: true,
      totalAmount: true,
      items: {
        take: 1,
        select: {
          productId: true,
          quantity: true,
          pricePerUnit: true,
        },
      },
    },
  });

  if (!order) throw new AppError('Pesanan tidak ditemukan.', 404);

  const firstItem = order.items[0];
  if (!firstItem) throw new AppError('Pesanan tidak memiliki item produk.', 400);

  return db.negotiation.create({
    data: {
      productId: firstItem.productId,
      orderId,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      quantity: firstItem.quantity,
      pricePerUnit: firstItem.pricePerUnit,
      totalEstimate: order.totalAmount,
      status: NegotiationStatus.LOCKED,
      isLocked: true,
      roomType: NegotiationRoomType.NEGOTIATION,
      taxStatus: TaxStatus.INCLUDED,
      specifications: 'Direct checkout — ruang mediasi sengketa',
      messages: {
        create: {
          senderId: order.buyerId,
          content: `Ruang mediasi sengketa dibuat otomatis untuk pesanan ${order.orderNumber}.`,
          isSystemMessage: true,
        },
      },
    },
  });
};

const DISPUTE_CHAT_MESSAGE_SELECT = {
  id: true,
  negotiationId: true,
  senderId: true,
  content: true,
  attachmentUrl: true,
  isSystemMessage: true,
  isRead: true,
  isDeleted: true,
  editedAt: true,
  createdAt: true,
  sender: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
} as const;

/**
 * Seed/legacy: order bisa status DISPUTED tanpa baris OrderDispute.
 * Pulihkan agar admin bisa mulai mediasi.
 */
export const ensureOrderDisputeRecord = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      buyerId: true,
      orderNumber: true,
      dispute: true,
    },
  });

  if (!order) throw new AppError('Order tidak ditemukan', 404);
  if (order.status !== OrderStatus.DISPUTED) {
    throw new AppError('Order tidak dalam status sengketa', 400);
  }
  if (order.dispute) return order.dispute;

  try {
    return await prisma.orderDispute.create({
      data: {
        orderId: order.id,
        raisedById: order.buyerId,
        reason: 'Sengketa (data dipulihkan)',
        description: `Order ${order.orderNumber} berstatus DISPUTED tanpa baris sengketa. Data dibuat otomatis agar admin dapat membuka mediasi.`,
        evidenceUrls: [],
        status: DisputeStatus.OPEN,
      },
    });
  } catch (err) {
    // Race: request lain sudah membuat baris sengketa
    const existing = await prisma.orderDispute.findUnique({ where: { orderId } });
    if (existing) return existing;
    throw err;
  }
};

const loadDisputedOrderContext = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      buyerId: true,
      sellerId: true,
      negotiation: { select: { id: true } },
      dispute: true,
    },
  });

  if (!order) throw new AppError('Order tidak ditemukan', 404);
  if (order.status !== OrderStatus.DISPUTED) {
    throw new AppError('Order tidak dalam status sengketa', 400);
  }

  const dispute = order.dispute ?? (await ensureOrderDisputeRecord(orderId));
  let negotiation = order.negotiation;
  if (!negotiation) {
    const room = await ensureDisputeNegotiationRoom(orderId);
    negotiation = { id: room.id };
  }

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    negotiation,
    dispute,
  };
};

export const countAdminMediationMessages = async (negotiationId: string) =>
  prisma.chatMessage.count({
    where: {
      negotiationId,
      isDeleted: false,
      OR: [
        { content: { startsWith: ADMIN_MEDIATION_PREFIX } },
        { sender: { role: UserRole.ADMIN } },
      ],
    },
  });

export const buildDisputeMediationMeta = async (order: {
  id: string;
  status: OrderStatus;
  negotiation: { id: string } | null;
  dispute: {
    mediationStartedAt: Date | null;
    readyToResolveAt: Date | null;
    sellerRespondedAt: Date | null;
    status: DisputeStatus;
  } | null;
}) => {
  const negotiationId = order.negotiation?.id ?? null;
  const dispute = order.dispute;
  const isDisputed = order.status === OrderStatus.DISPUTED;

  let adminMessageCount = 0;
  if (negotiationId) {
    adminMessageCount = await countAdminMediationMessages(negotiationId);
  }

  const mediationStarted = Boolean(dispute?.mediationStartedAt);
  const readyToResolve = Boolean(dispute?.readyToResolveAt);

  return {
    negotiationId,
    mediationStartedAt: dispute?.mediationStartedAt ?? null,
    readyToResolveAt: dispute?.readyToResolveAt ?? null,
    adminMessageCount,
    canMediate: isDisputed && Boolean(negotiationId),
    canMarkReady: isDisputed && mediationStarted && adminMessageCount > 0 && !readyToResolve,
    canResolve: isDisputed && mediationStarted && readyToResolve && adminMessageCount > 0,
  };
};

export const getDisputeChatThread = async (
  orderId: string,
  params: { page: number; limit: number },
) => {
  const order = await loadDisputedOrderContext(orderId);

  // Ruang mediasi = Negotiation terhubung ke order (bukan field di OrderDispute).
  if (!order.negotiation) {
    throw new AppError('Order ini tidak memiliki ruang negosiasi atau mediasi terkait', 404);
  }
  const negotiationId = order.negotiation.id;

  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const [messages, total, negotiation, mediation] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { negotiationId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
      select: DISPUTE_CHAT_MESSAGE_SELECT,
    }),
    prisma.chatMessage.count({ where: { negotiationId, isDeleted: false } }),
    prisma.negotiation.findUnique({
      where: { id: negotiationId },
      select: {
        id: true,
        status: true,
        buyer: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        seller: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        product: { select: { id: true, name: true } },
      },
    }),
    buildDisputeMediationMeta(order),
  ]);

  if (!negotiation) throw new AppError('Ruang negosiasi tidak ditemukan', 404);

  return attachAdminChatThreadMedia({
    negotiation,
    messages,
    mediation,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
};

const notifyDisputeParties = async (
  order: { buyerId: string; sellerId: string; orderNumber: string; id: string },
  title: string,
  body: string,
) => {
  for (const userId of [order.buyerId, order.sellerId]) {
    void createNotification({
      userId,
      title,
      body,
      type: NotificationType.DISPUTE,
      priority: NotificationPriority.HIGH,
      refId: order.id,
    }).catch(() => {});
  }
};

export const startDisputeMediation = async (orderId: string, adminId: string) => {
  const order = await loadDisputedOrderContext(orderId);
  if (!order.negotiation) {
    throw new AppError('Order ini tidak memiliki ruang negosiasi terkait', 404);
  }

  if (order.dispute.mediationStartedAt) {
    return buildDisputeMediationMeta(order);
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderDispute.update({
      where: { orderId },
      data: {
        mediationStartedAt: new Date(),
        mediationStartedById: adminId,
        status:
          order.dispute.status === DisputeStatus.OPEN
            ? DisputeStatus.UNDER_REVIEW
            : order.dispute.status,
      },
    });

    await tx.chatMessage.create({
      data: {
        negotiationId: order.negotiation!.id,
        senderId: adminId,
        content: `${ADMIN_MEDIATION_PREFIX} Admin BISA bergabung untuk mediasi sengketa pesanan ${order.orderNumber}.`,
        isSystemMessage: true,
      },
    });
  });

  pusher
    .trigger(`private-negotiation-${order.negotiation.id}`, 'new-message', {
      negotiationId: order.negotiation.id,
    })
    .catch(() => {});

  await notifyDisputeParties(
    order,
    'Mediasi Sengketa',
    `Admin BISA memulai mediasi untuk pesanan ${order.orderNumber}. Silakan cek chat negosiasi.`,
  );

  const refreshed = await loadDisputedOrderContext(orderId);
  return buildDisputeMediationMeta(refreshed);
};

export const sendDisputeMediationMessage = async (
  orderId: string,
  adminId: string,
  content: string,
) => {
  const trimmed = content.trim();
  if (!trimmed) throw new AppError('Pesan tidak boleh kosong.', 400);

  const order = await loadDisputedOrderContext(orderId);
  if (!order.negotiation) {
    throw new AppError('Order ini tidak memiliki ruang negosiasi terkait', 404);
  }

  const negotiationId = order.negotiation.id;
  const formattedContent = trimmed.startsWith(ADMIN_MEDIATION_PREFIX)
    ? trimmed
    : `${ADMIN_MEDIATION_PREFIX} ${trimmed}`;

  const message = await prisma.$transaction(async (tx) => {
    if (!order.dispute.mediationStartedAt) {
      await tx.orderDispute.update({
        where: { orderId },
        data: {
          mediationStartedAt: new Date(),
          mediationStartedById: adminId,
          status:
            order.dispute.status === DisputeStatus.OPEN
              ? DisputeStatus.UNDER_REVIEW
              : order.dispute.status,
        },
      });
    }

    return tx.chatMessage.create({
      data: {
        negotiationId,
        senderId: adminId,
        content: formattedContent,
        isSystemMessage: true,
      },
      select: DISPUTE_CHAT_MESSAGE_SELECT,
    });
  });

  await prisma.negotiation.update({
    where: { id: negotiationId },
    data: { updatedAt: new Date() },
  });

  pusher.trigger(`private-negotiation-${negotiationId}`, 'new-message', message).catch(() => {});

  await notifyDisputeParties(
    order,
    'Pesan Mediasi Admin',
    `Admin BISA: ${trimmed.replace(ADMIN_MEDIATION_PREFIX, '').trim()}`,
  );

  return message;
};

export const markDisputeReadyToResolve = async (orderId: string, adminId: string) => {
  const order = await loadDisputedOrderContext(orderId);
  if (!order.negotiation) {
    throw new AppError('Order ini tidak memiliki ruang negosiasi terkait', 404);
  }
  if (!order.dispute.mediationStartedAt) {
    throw new AppError(
      'Mediasi belum dimulai. Mulai mediasi atau kirim pesan sebagai Hakim BISA terlebih dahulu.',
      400,
    );
  }

  if (order.dispute.readyToResolveAt) {
    return buildDisputeMediationMeta(order);
  }

  const adminMessageCount = await countAdminMediationMessages(order.negotiation.id);
  if (adminMessageCount === 0) {
    throw new AppError('Kirim minimal satu pesan mediasi sebelum menandai siap putus.', 400);
  }

  await prisma.orderDispute.update({
    where: { orderId },
    data: { readyToResolveAt: new Date() },
  });

  await prisma.chatMessage.create({
    data: {
      negotiationId: order.negotiation.id,
      senderId: adminId,
      content: `${ADMIN_MEDIATION_PREFIX} Mediasi selesai — admin akan segera memutus release atau refund.`,
      isSystemMessage: true,
    },
  });

  pusher
    .trigger(`private-negotiation-${order.negotiation.id}`, 'new-message', {
      negotiationId: order.negotiation.id,
    })
    .catch(() => {});

  const refreshed = await loadDisputedOrderContext(orderId);
  return buildDisputeMediationMeta(refreshed);
};

export const assertDisputeReadyForResolution = async (orderId: string) => {
  const order = await loadDisputedOrderContext(orderId);
  const meta = await buildDisputeMediationMeta(order);

  if (!meta.mediationStartedAt) {
    throw new AppError(
      'Mediasi belum dimulai. Admin harus memulai mediasi di chat sebelum menyelesaikan sengketa.',
      400,
    );
  }
  if (meta.adminMessageCount === 0) {
    throw new AppError('Kirim minimal satu pesan mediasi sebagai Hakim BISA sebelum resolve.', 400);
  }
  if (!meta.readyToResolveAt) {
    throw new AppError('Tandai mediasi sebagai siap putus sebelum release atau refund.', 400);
  }

  return order;
};

export const postDisputeResolvedChatMessage = async (
  orderId: string,
  adminId: string,
  resolution: 'RELEASE' | 'REFUND',
  note: string,
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { negotiation: { select: { id: true } }, orderNumber: true },
  });
  if (!order?.negotiation) return;

  const label = resolution === 'RELEASE' ? 'RELEASE ke supplier' : 'REFUND ke pembeli';
  await prisma.chatMessage.create({
    data: {
      negotiationId: order.negotiation.id,
      senderId: adminId,
      content: `${ADMIN_MEDIATION_PREFIX} SENGKETA DISELESAIKAN (${label}): ${note.trim()}`,
      isSystemMessage: true,
    },
  });

  pusher
    .trigger(`private-negotiation-${order.negotiation.id}`, 'new-message', {
      negotiationId: order.negotiation.id,
    })
    .catch(() => {});
};
