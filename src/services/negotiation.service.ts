import prisma from '#config/prisma';
import pusher from '#config/pusher';
import AppError from '#utils/appError';
import { assertQuantityMeetsMinOrder } from '#utils/productOrderRules';
import { assertBuyerCommerceReady } from '#utils/readiness.util';
import {
  NegotiationStatus,
  OrderStatus,
  Prisma,
  TaxStatus,
  ProductStatus,
  UserRole,
} from '#prisma';
import {
  buildTechnicalSpecifications,
  NegotiationChatPurpose,
  negotiationPurposeWhere,
  purposeToRoomType,
} from '#constants/negotiation.constants';
import { buildDealEconomics } from '#services/order.service';
// import { sendNotification } from '#services/notification.service'; // TODO: integrate later

const CHAT_MESSAGE_SELECT = {
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

const EDIT_MESSAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const assertNegotiationParticipant = async (negotiationId: string, userId: string) => {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
    select: { id: true, buyerId: true, sellerId: true, status: true },
  });
  if (!negotiation) throw new AppError('Ruang negosiasi tidak ditemukan.', 404);
  if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
    throw new AppError('Anda bukan partisipan dalam negosiasi ini.', 403);
  }
  return negotiation;
};

/** Status negosiasi yang masih boleh mengirim chat. */
const CHAT_ACTIVE_NEGOTIATION_STATUSES: NegotiationStatus[] = [
  NegotiationStatus.OPEN_NEGOTIATION,
  NegotiationStatus.OFFER_SUBMITTED,
  NegotiationStatus.OFFER_ACCEPTED,
  NegotiationStatus.LOCKED,
];

/**
 * Cari ruang chat (negosiasi) aktif untuk produk — buyer atau seller produk tersebut.
 */
export const findChatRoomByProduct = async (
  userId: string,
  productId: string,
  purpose: NegotiationChatPurpose = 'negotiation',
) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, userId: true, status: true },
  });

  if (!product || product.status !== ProductStatus.ACTIVE) {
    throw new AppError('Produk tidak ditemukan atau tidak tersedia.', 404);
  }

  const purposeFilter = negotiationPurposeWhere(purpose);

  if (product.userId !== userId) {
    return prisma.negotiation.findFirst({
      where: {
        productId,
        buyerId: userId,
        status: { in: CHAT_ACTIVE_NEGOTIATION_STATUSES },
        ...purposeFilter,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        roomType: true,
      },
    });
  }

  return prisma.negotiation.findFirst({
    where: {
      productId,
      sellerId: userId,
      status: { in: CHAT_ACTIVE_NEGOTIATION_STATUSES },
      ...purposeFilter,
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      roomType: true,
    },
  });
};

/**
 * 1. Create a new Offer (Negotiation)
 * Callable by: BUYER
 */
export const createOffer = async (
  buyerId: string,
  data: {
    productId: string;
    quantity: number;
    pricePerUnit: number;
    message?: string;
    attachmentUrl?: string;
    purpose?: NegotiationChatPurpose;
  },
) => {
  await assertBuyerCommerceReady(buyerId);

  const purpose: NegotiationChatPurpose = data.purpose ?? 'negotiation';
  // Validate quantity and price are positive
  if (data.quantity <= 0) {
    throw new AppError('Jumlah pesanan harus lebih dari 0.', 400);
  }
  if (data.pricePerUnit <= 0) {
    throw new AppError('Harga per unit harus lebih dari 0.', 400);
  }

  const product = await prisma.product.findUnique({
    where: { id: data.productId },
    select: {
      id: true,
      userId: true,
      name: true,
      status: true,
      stock: true,
      minOrder: true,
      unit: true,
      technicalSpec: {
        select: {
          carbonPurity: true,
          phLevel: true,
          moistureContent: true,
        },
      },
    },
  });

  if (!product || product.status !== ProductStatus.ACTIVE) {
    throw new AppError('Produk tidak ditemukan atau tidak tersedia.', 404);
  }
  if (product.userId === buyerId) {
    throw new AppError('Anda tidak bisa menawar produk Anda sendiri.', 400);
  }
  // CRIT-007: Early stock check to prevent phantom negotiations
  if (product.stock.lt(data.quantity)) {
    throw new AppError(
      `Stok produk tidak mencukupi (tersedia: ${product.stock}, diminta: ${data.quantity}).`,
      400,
    );
  }
  const minOrder = Number(product.minOrder);
  if (data.quantity < minOrder) {
    throw new AppError(`Minimal order ${minOrder} ${product.unit}.`, 400);
  }

  const existingOpenOffer = await prisma.negotiation.findFirst({
    where: {
      buyerId,
      productId: data.productId,
      status: NegotiationStatus.OPEN_NEGOTIATION,
      ...negotiationPurposeWhere(purpose),
    },
  });

  if (existingOpenOffer) {
    const msg =
      purpose === 'inquiry'
        ? 'Anda masih memiliki chat tanya produk yang aktif. Lanjutkan percakapan atau tunggu balasan penjual.'
        : 'Anda masih memiliki penawaran yang belum dijawab untuk produk ini. Silakan chat Supplier atau tunggu batas waktu.';
    throw new AppError(msg, 409);
  }

  // Hitung Estimasi Total
  const qtyDecimal = new Prisma.Decimal(data.quantity);
  const priceDecimal = new Prisma.Decimal(data.pricePerUnit);
  const totalEstimate = qtyDecimal.mul(priceDecimal);

  let technicalLine = '';
  if (product.technicalSpec) {
    const ts = product.technicalSpec;
    technicalLine = `Base Specs: ${ts.carbonPurity ? ts.carbonPurity + '% Carbon, ' : ''}${
      ts.phLevel ? ts.phLevel + ' pH, ' : ''
    }${ts.moistureContent ? ts.moistureContent + '% Moisture' : ''}`;
  }
  const initialSpecs = buildTechnicalSpecifications(technicalLine);
  const roomType = purposeToRoomType(purpose);

  const defaultMessage =
    purpose === 'inquiry'
      ? `Halo, saya ingin bertanya tentang produk "${product.name}".`
      : `Saya tertarik dengan produk ini. Penawaran awal saya: Rp ${data.pricePerUnit} per satuan untuk total ${data.quantity} satuan.`;

  const negotiation = await prisma.negotiation.create({
    data: {
      buyerId,
      sellerId: product.userId,
      productId: data.productId,
      quantity: qtyDecimal,
      pricePerUnit: priceDecimal,
      totalEstimate,
      specifications: initialSpecs,
      roomType,
      taxStatus: TaxStatus.INCLUDED, // Default
      messages: {
        create: {
          senderId: buyerId,
          content: data.message || defaultMessage,
          attachmentUrl: data.attachmentUrl,
          isSystemMessage: !data.message,
        },
      },
    },
    select: {
      id: true,
      productId: true,
      buyerId: true,
      sellerId: true,
      quantity: true,
      pricePerUnit: true,
      totalEstimate: true,
      specifications: true,
      taxStatus: true,
      status: true,
      isLocked: true,
      createdAt: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          biomassaType: true,
          pricePerUnit: true,
          unit: true,
          minOrder: true,
          thumbnailUrl: true,
        },
      },
      buyer: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          profile: { select: { companyName: true } },
        },
      },
      seller: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          profile: { select: { companyName: true } },
        },
      },
    },
  });

  // Contoh Notifikasi:
  // await sendNotification(product.userId, 'Tawaran Baru Masuk', `Seseorang menawar ${product.name}`, 'OFFER', negotiation.id);

  // Trigger Pusher for Seller
  pusher.trigger(`private-user-${product.userId}`, 'new-negotiation', {
    negotiationId: negotiation.id,
    message: `Ada penawaran baru untuk produk ${product.name}`,
  });

  return negotiation;
};

/**
 * 2. List Offers (My Offers / Incoming)
 */
export const listNegotiations = async (params: {
  userId: string;
  type: UserRole;
  statusFilter?: string;
  keyword?: string;
  productMode?: string;
  roomType?: NegotiationChatPurpose;
  page?: number;
  limit?: number;
}) => {
  const {
    userId,
    type,
    statusFilter,
    keyword,
    productMode,
    roomType,
    page = 1,
    limit = 20,
  } = params;
  const skip = (page - 1) * limit;
  const where: Prisma.NegotiationWhereInput = {
    ...(type === UserRole.BUYER ? { buyerId: userId } : { sellerId: userId }),
    ...(statusFilter &&
      Object.values(NegotiationStatus).includes(statusFilter as NegotiationStatus) && {
        status: statusFilter as NegotiationStatus,
      }),
    ...(keyword && {
      product: {
        name: { contains: keyword },
      },
    }),
    ...(productMode && {
      product: {
        productMode: productMode as any,
      },
    }),
    ...(roomType && negotiationPurposeWhere(roomType)),
  };

  const [negotiations, total] = await Promise.all([
    prisma.negotiation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        orderId: true,
        productId: true,
        buyerId: true,
        sellerId: true,
        quantity: true,
        pricePerUnit: true,
        totalEstimate: true,
        specifications: true,
        roomType: true,
        taxStatus: true,
        status: true,
        isLocked: true,
        createdAt: true,
        updatedAt: true,
        product: {
          select: {
            id: true,
            name: true,
            pricePerUnit: true,
            unit: true,
            minOrder: true,
            stock: true,
            biomassaType: true,
            thumbnailUrl: true,
            description: true,
            regency: true,
            province: true,
          },
        },
        buyer: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            profile: { select: { companyName: true } },
            regency: true,
            province: true,
          },
        },
        seller: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            profile: { select: { companyName: true } },
            regency: true,
            province: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
          },
        },
        _count: {
          select: {
            messages: {
              where: {
                isRead: false,
                senderId: { not: userId },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            isRead: true,
            senderId: true,
          },
        },
      },
      skip,
      take: limit,
    }),
    prisma.negotiation.count({ where }),
  ]);

  return {
    data: negotiations,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * 2b. Auto-Expiry Logic (Mark 48h old OPEN negotiations as EXPIRED)
 * Should be called by a CRON JOB instead of every GET request.
 */
export const expireNegotiations = async () => {
  const expiryThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const toExpire = await prisma.negotiation.findMany({
    where: {
      status: { in: [NegotiationStatus.OPEN_NEGOTIATION, NegotiationStatus.OFFER_SUBMITTED] },
      updatedAt: { lt: expiryThreshold },
    },
    select: { id: true, sellerId: true },
  });

  const reason = 'Negosiasi kedaluwarsa karena tidak ada respons selama 48 jam.';

  for (const negotiation of toExpire) {
    await prisma.$transaction([
      prisma.negotiation.update({
        where: { id: negotiation.id },
        data: {
          status: NegotiationStatus.EXPIRED,
          closedBy: 'SYSTEM',
          rejectionReason: reason,
        },
      }),
      prisma.chatMessage.create({
        data: {
          negotiationId: negotiation.id,
          senderId: negotiation.sellerId,
          content: `â± ${reason}`,
          isSystemMessage: true,
        },
      }),
    ]);
  }

  return { count: toExpire.length };
};

/**
 * 3. Update Offer Status (Accept / Reject)
 * Callable by: SELLER
 */
export const updateOfferStatus = async (
  id: string,
  sellerId: string,
  status: 'OFFER_ACCEPTED' | 'OFFER_REJECTED',
  updateData?: {
    quantity?: number;
    pricePerUnit?: number;
    specifications?: string;
    taxStatus?: TaxStatus;
    rejectionReason?: string;
  },
) => {
  const negotiation = await prisma.negotiation.findUnique({ where: { id } });
  if (!negotiation) throw new AppError('Data penawaran tidak ditemukan.', 404);
  if (negotiation.sellerId !== sellerId)
    throw new AppError('Anda tidak memiliki hak atas produk ini.', 403);

  if (negotiation.status === NegotiationStatus.EXPIRED) {
    throw new AppError('Penawaran ini sudah kedaluwarsa (lebih dari 48 jam).', 400);
  }

  if (negotiation.status === NegotiationStatus.LOCKED) {
    throw new AppError('Negosiasi sudah dikunci menjadi kontrak resmi.', 400);
  }
  // Hitung ulang total jika ada perubahan harga/jumlah
  const finalQty = updateData?.quantity
    ? new Prisma.Decimal(updateData.quantity)
    : negotiation.quantity;
  const finalPrice = updateData?.pricePerUnit
    ? new Prisma.Decimal(updateData.pricePerUnit)
    : negotiation.pricePerUnit;
  const finalTotal = finalQty.mul(finalPrice);

  if (status === NegotiationStatus.OFFER_ACCEPTED) {
    await assertQuantityMeetsMinOrder(negotiation.productId, Number(finalQty));
  }

  const rejectionReason = updateData?.rejectionReason?.trim();
  if (status === NegotiationStatus.OFFER_REJECTED && !rejectionReason) {
    throw new AppError('Alasan penolakan wajib diisi.', 400);
  }

  const systemMessage =
    status === NegotiationStatus.OFFER_ACCEPTED
      ? `Penawaran disetujui! Nilai final: Rp ${finalPrice}/Unit untuk ${finalQty} satuan. Saya akan segera merilis Kontrak dan Tagihan.`
      : `Penawaran ditolak supplier. Alasan: ${rejectionReason}`;

  const updated = await prisma.negotiation.update({
    where: { id },
    data: {
      status: status as NegotiationStatus,
      quantity: finalQty,
      pricePerUnit: finalPrice,
      totalEstimate: finalTotal,
      specifications: updateData?.specifications ?? negotiation.specifications,
      taxStatus: updateData?.taxStatus ?? negotiation.taxStatus,
      rejectionReason: status === NegotiationStatus.OFFER_REJECTED ? rejectionReason : null,
      closedBy: status === NegotiationStatus.OFFER_REJECTED ? 'SUPPLIER' : null,
      messages: {
        create: {
          senderId: sellerId,
          content: systemMessage,
          isSystemMessage: true,
        },
      },
    },
  });

  // Trigger Pusher for Status Update
  pusher.trigger(`private-negotiation-${id}`, 'status-updated', {
    status: updated.status,
    negotiation: updated,
  });

  return updated;
};

/**
 * 3a. Cancel Negotiation (Buyer withdraws offer)
 * Callable by: BUYER
 */
export const cancelNegotiation = async (
  id: string,
  buyerId: string,
  cancellationReason: string,
) => {
  const negotiation = await prisma.negotiation.findUnique({ where: { id } });
  if (!negotiation) throw new AppError('Data penawaran tidak ditemukan.', 404);
  if (negotiation.buyerId !== buyerId) {
    throw new AppError('Anda tidak memiliki hak membatalkan negosiasi ini.', 403);
  }

  if (negotiation.status === NegotiationStatus.EXPIRED) {
    throw new AppError('Penawaran ini sudah kedaluwarsa.', 400);
  }

  if (
    negotiation.status === NegotiationStatus.LOCKED ||
    negotiation.status === NegotiationStatus.OFFER_ACCEPTED
  ) {
    throw new AppError('Negosiasi sudah diterima dan tidak dapat dibatalkan.', 400);
  }

  const reason = cancellationReason.trim();
  if (!reason) throw new AppError('Alasan pembatalan wajib diisi.', 400);

  const updated = await prisma.negotiation.update({
    where: { id },
    data: {
      status: NegotiationStatus.CANCELLED,
      closedBy: 'BUYER',
      rejectionReason: reason,
      messages: {
        create: {
          senderId: buyerId,
          content: `Negosiasi dibatalkan pembeli. Alasan: ${reason}`,
          isSystemMessage: true,
        },
      },
    },
  });

  pusher.trigger(`private-negotiation-${id}`, 'status-updated', {
    status: updated.status,
    negotiation: updated,
  });

  return updated;
};

/**
 * 3b. Counter Offer (Supplier proposes revised terms)
 * Callable by: SELLER
 */
export const counterOffer = async (
  id: string,
  sellerId: string,
  data: { quantity: number; pricePerUnit: number },
) => {
  const negotiation = await prisma.negotiation.findUnique({ where: { id } });
  if (!negotiation) throw new AppError('Data penawaran tidak ditemukan.', 404);
  if (negotiation.sellerId !== sellerId)
    throw new AppError('Anda tidak memiliki hak atas produk ini.', 403);

  if (negotiation.status === NegotiationStatus.EXPIRED) {
    throw new AppError('Penawaran ini sudah kedaluwarsa (lebih dari 48 jam).', 400);
  }

  if (negotiation.status === NegotiationStatus.LOCKED) {
    throw new AppError('Negosiasi sudah dikunci menjadi kontrak resmi.', 400);
  }

  if (negotiation.orderId) {
    throw new AppError('Tagihan sudah diterbitkan, tidak bisa nego ulang.', 400);
  }

  const blockedCounterStatuses: NegotiationStatus[] = [
    NegotiationStatus.OFFER_REJECTED,
    NegotiationStatus.CANCELLED,
    NegotiationStatus.EXPIRED,
  ];
  if (blockedCounterStatuses.includes(negotiation.status as NegotiationStatus)) {
    throw new AppError(`Negosiasi tidak bisa di-counter pada status ${negotiation.status}.`, 400);
  }

  const finalQty = new Prisma.Decimal(data.quantity);
  const finalPrice = new Prisma.Decimal(data.pricePerUnit);
  const finalTotal = finalQty.mul(finalPrice);

  await assertQuantityMeetsMinOrder(negotiation.productId, Number(finalQty));

  const reopenFromAccepted = negotiation.status === NegotiationStatus.OFFER_ACCEPTED;
  const counterMessage = reopenFromAccepted
    ? `Supplier membuka nego ulang: Rp ${finalPrice}/unit untuk ${finalQty} satuan. Silakan tinjau tawaran baru.`
    : `Counter offer: Rp ${finalPrice}/unit untuk ${finalQty} satuan. Silakan tinjau tawaran baru.`;

  const updated = await prisma.negotiation.update({
    where: { id },
    data: {
      status: NegotiationStatus.OPEN_NEGOTIATION,
      quantity: finalQty,
      pricePerUnit: finalPrice,
      totalEstimate: finalTotal,
      messages: {
        create: {
          senderId: sellerId,
          content: counterMessage,
          isSystemMessage: true,
        },
      },
    },
  });

  pusher.trigger(`private-negotiation-${id}`, 'status-updated', {
    status: updated.status,
    negotiation: updated,
  });

  return updated;
};

/**
 * 4. Send Chat Message
 */
export const sendChatMessage = async (
  negotiationId: string,
  senderId: string,
  content: string,
  attachmentUrl?: string,
) => {
  const negotiation = await prisma.negotiation.findUnique({ where: { id: negotiationId } });
  if (!negotiation) throw new AppError('Ruang negosiasi tidak ditemukan.', 404);

  // Participant check
  if (negotiation.buyerId !== senderId && negotiation.sellerId !== senderId) {
    throw new AppError('Anda bukan partisipan dalam negosiasi ini.', 403);
  }

  // Chat tetap aktif setelah tagihan (LOCKED) agar buyer & supplier bisa koordinasi.
  // Hanya status penutupan negosiasi yang memblokir pesan baru.
  const CHAT_BLOCKED_STATUSES: string[] = [
    NegotiationStatus.OFFER_REJECTED,
    NegotiationStatus.EXPIRED,
    NegotiationStatus.CANCELLED,
  ];
  if (CHAT_BLOCKED_STATUSES.includes(negotiation.status)) {
    throw new AppError(`Chat ditutup karena status negosiasi sudah ${negotiation.status}.`, 400);
  }

  const message = await prisma.chatMessage.create({
    data: {
      negotiationId,
      senderId,
      content,
      attachmentUrl,
    },
    include: {
      sender: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          role: true,
        },
      },
    },
  });

  // Trigger Pusher for New Message
  pusher.trigger(`private-negotiation-${negotiationId}`, 'new-message', message);

  return message;
};

/**
 * 5. List Chat Messages
 */
const DETAIL_MESSAGE_LIMIT = 50;

export const listChatMessages = async (
  negotiationId: string,
  userId: string,
  options: { page?: number; limit?: number; skip?: number } = {},
) => {
  const limit = Math.max(1, options.limit ?? 50);
  const skip =
    options.skip !== undefined
      ? Math.max(0, options.skip)
      : (Math.max(1, options.page ?? 1) - 1) * limit;
  const negotiation = await prisma.negotiation.findUnique({ where: { id: negotiationId } });
  if (!negotiation) throw new AppError('Ruang negosiasi tidak ditemukan.', 404);

  if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
    throw new AppError('Akses ditolak.', 403);
  }

  const [messages, total] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { negotiationId },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
      select: CHAT_MESSAGE_SELECT,
    }),
    prisma.chatMessage.count({ where: { negotiationId } }),
  ]);

  return {
    data: messages,
    meta: {
      total,
      page: Math.floor(skip / limit) + 1,
      limit,
      skip,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * 6. Get Negotiation Detail by ID
 * Callable by: BUYER or SELLER that are participants
 */
export const getNegotiationById = async (id: string, userId: string) => {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id },
    select: {
      id: true,
      orderId: true,
      productId: true,
      buyerId: true,
      sellerId: true,
      quantity: true,
      pricePerUnit: true,
      totalEstimate: true,
      specifications: true,
      taxStatus: true,
      status: true,
      isLocked: true,
      createdAt: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          pricePerUnit: true,
          unit: true,
          minOrder: true,
          stock: true,
          biomassaType: true,
          thumbnailUrl: true,
          description: true,
          regency: true,
          province: true,
          status: true,
        },
      },
      buyer: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          profile: { select: { companyName: true } },
        },
      },
      seller: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          profile: { select: { companyName: true } },
        },
      },
      order: {
        select: {
          id: true,
          orderNumber: true,
          subtotal: true,
          platformFee: true,
          vatAmount: true,
          totalAmount: true,
          status: true,
          shippingAddressSnapshot: true,
        },
      },
      _count: { select: { messages: true } },
      messages: {
        select: CHAT_MESSAGE_SELECT,
        orderBy: { createdAt: 'desc' },
        take: DETAIL_MESSAGE_LIMIT,
      },
    },
  });

  if (!negotiation) throw new AppError('Negosiasi tidak ditemukan.', 404);
  if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
    throw new AppError('Anda bukan partisipan dalam negosiasi ini.', 403);
  }

  const economics = await buildDealEconomics({
    catalogPricePerUnit: Number(negotiation.product.pricePerUnit),
    negotiatedPricePerUnit: Number(negotiation.pricePerUnit),
    quantity: Number(negotiation.quantity),
    productStock: Number(negotiation.product.stock),
    unit: negotiation.product.unit,
  });

  const { _count, messages, ...rest } = negotiation;
  return {
    ...rest,
    economics,
    messages: [...messages].reverse(),
    messagesTotal: _count.messages,
  };
};

/**
 * 7. Mark Messages as Read
 *
 * SEC-BE-009: cek participant sebelum updateMany â€” sebelumnya user authenticated
 * manapun bisa mark-read negosiasi orang lain (UI spoofing / integrity).
 */
export const markMessagesAsRead = async (negotiationId: string, userId: string) => {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
    select: { buyerId: true, sellerId: true },
  });
  if (!negotiation) throw new AppError('Negosiasi tidak ditemukan.', 404);
  if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
    throw new AppError('Akses ditolak.', 403);
  }

  const result = await prisma.chatMessage.updateMany({
    where: {
      negotiationId,
      senderId: { not: userId }, // only mark messages sent by the OTHER person as read
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });
  return result;
};

/**
 * 8. Set Typing Status
 */
export const setTypingStatus = async (negotiationId: string, userId: string, isTyping: boolean) => {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
    select: { buyerId: true, sellerId: true },
  });

  if (!negotiation) throw new AppError('Negosiasi tidak ditemukan.', 404);
  if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
    throw new AppError('Akses ditolak.', 403);
  }

  // Trigger Pusher for Typing Status
  // We send it to the negotiation channel so the other participant can receive it
  pusher.trigger(`private-negotiation-${negotiationId}`, 'typing-status', {
    userId,
    isTyping,
  });

  return { userId, isTyping };
};

/**
 * 9. Edit Chat Message (own messages only, within 24h)
 */
export const editChatMessage = async (
  negotiationId: string,
  messageId: string,
  userId: string,
  content: string,
) => {
  await assertNegotiationParticipant(negotiationId, userId);

  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, negotiationId },
  });
  if (!message) throw new AppError('Pesan tidak ditemukan.', 404);
  if (message.isSystemMessage) throw new AppError('Pesan sistem tidak dapat diedit.', 400);
  if (message.senderId !== userId) {
    throw new AppError('Anda hanya dapat mengedit pesan sendiri.', 403);
  }
  if (message.isDeleted) throw new AppError('Pesan sudah dihapus.', 400);

  const ageMs = Date.now() - message.createdAt.getTime();
  if (ageMs > EDIT_MESSAGE_MAX_AGE_MS) {
    throw new AppError('Pesan hanya dapat diedit dalam 24 jam setelah dikirim.', 400);
  }

  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { content: content.trim(), editedAt: new Date() },
    select: CHAT_MESSAGE_SELECT,
  });

  pusher.trigger(`private-negotiation-${negotiationId}`, 'message-updated', updated);
  return updated;
};

/**
 * 10. Delete Chat Message (soft delete, own messages only)
 */
export const deleteChatMessage = async (
  negotiationId: string,
  messageId: string,
  userId: string,
) => {
  await assertNegotiationParticipant(negotiationId, userId);

  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, negotiationId },
  });
  if (!message) throw new AppError('Pesan tidak ditemukan.', 404);
  if (message.isSystemMessage) throw new AppError('Pesan sistem tidak dapat dihapus.', 400);
  if (message.senderId !== userId) {
    throw new AppError('Anda hanya dapat menghapus pesan sendiri.', 403);
  }
  if (message.isDeleted) throw new AppError('Pesan sudah dihapus.', 400);

  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: {
      isDeleted: true,
      content: '',
      attachmentUrl: null,
      editedAt: null,
    },
    select: CHAT_MESSAGE_SELECT,
  });

  pusher.trigger(`private-negotiation-${negotiationId}`, 'message-deleted', updated);
  return updated;
};

/**
 * 11. Clear Chat History (removes user messages, keeps system messages)
 */
export const clearChatMessages = async (negotiationId: string, userId: string) => {
  const negotiation = await assertNegotiationParticipant(negotiationId, userId);

  const linkedOrder = await prisma.order.findFirst({
    where: { negotiation: { id: negotiationId }, status: OrderStatus.DISPUTED },
    select: { id: true },
  });
  if (linkedOrder) {
    throw new AppError(
      'Riwayat chat tidak dapat dihapus saat pesanan dalam sengketa aktif.',
      400,
    );
  }

  const CHAT_BLOCKED_STATUSES: string[] = [
    NegotiationStatus.OFFER_REJECTED,
    NegotiationStatus.EXPIRED,
    NegotiationStatus.CANCELLED,
  ];
  if (CHAT_BLOCKED_STATUSES.includes(negotiation.status)) {
    throw new AppError(`Chat ditutup karena status negosiasi sudah ${negotiation.status}.`, 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.deleteMany({
      where: { negotiationId, isSystemMessage: false },
    });
    await tx.chatMessage.create({
      data: {
        negotiationId,
        senderId: userId,
        content: `${user?.fullName ?? 'Pengguna'} membersihkan riwayat chat.`,
        isSystemMessage: true,
      },
    });
  });

  pusher.trigger(`private-negotiation-${negotiationId}`, 'chat-cleared', {
    negotiationId,
    clearedBy: userId,
  });

  return { cleared: true };
};
