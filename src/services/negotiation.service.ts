import prisma from '#config/prisma';

import AppError from '#utils/appError';
import { NegotiationStatus, Prisma, TaxStatus, ProductStatus } from '#prisma';
// import { sendNotification } from '#services/notification.service'; // TODO: integrate later

/**
 * 1. Create a new Offer (Negotiation)
 * Callable by: BUYER
 */
export const createOffer = async (
  buyerId: string,
  data: { productId: string; quantity: number; pricePerUnit: number },
) => {
  const product = await prisma.product.findUnique({
    where: { id: data.productId },
    include: { technicalSpec: true },
  });

  if (!product || product.status !== ProductStatus.ACTIVE) {
    throw new AppError('Produk tidak ditemukan atau tidak tersedia.', 404);
  }
  if (product.userId === buyerId) {
    throw new AppError('Anda tidak bisa menawar produk Anda sendiri.', 400);
  }

  // Cek apakah ada negosiasi terbuka sebelumnya untuk produk ini
  const existingOpenOffer = await prisma.negotiation.findFirst({
    where: {
      buyerId,
      productId: data.productId,
      status: NegotiationStatus.OPEN_NEGOTIATION,
    },
  });

  if (existingOpenOffer) {
    throw new AppError(
      'Anda masih memiliki penawaran yang belum dijawab untuk produk ini. Silakan chat Supplier atau tunggu batas waktu.',
      409,
    );
  }

  // Hitung Estimasi Total
  const qtyDecimal = new Prisma.Decimal(data.quantity);
  const priceDecimal = new Prisma.Decimal(data.pricePerUnit);
  const totalEstimate = qtyDecimal.mul(priceDecimal);

  let initialSpecs = '';
  if (product.technicalSpec) {
    const ts = product.technicalSpec;
    initialSpecs = `Base Specs: ${ts.carbonPurity ? ts.carbonPurity + '% Carbon, ' : ''}${
      ts.phLevel ? ts.phLevel + ' pH, ' : ''
    }${ts.moistureContent ? ts.moistureContent + '% Moisture' : ''}`;
  }

  const negotiation = await prisma.negotiation.create({
    data: {
      buyerId,
      sellerId: product.userId,
      productId: data.productId,
      quantity: qtyDecimal,
      pricePerUnit: priceDecimal,
      totalEstimate,
      specifications: initialSpecs,
      taxStatus: TaxStatus.INCLUDED, // Default
      messages: {
        create: {
          senderId: buyerId,
          content: `Saya tertarik dengan produk ini. Penawaran awal saya: Rp ${data.pricePerUnit} per satuan untuk total ${data.quantity} satuan.`,
          isSystemMessage: true,
        },
      },
    },
    include: { product: true },
  });

  // Contoh Notifikasi:
  // await sendNotification(product.userId, 'Tawaran Baru Masuk', `Seseorang menawar ${product.name}`, 'OFFER', negotiation.id);

  return negotiation;
};

/**
 * 2. List Offers (My Offers / Incoming)
 */
export const listNegotiations = async (params: {
  userId: string;
  type: 'BUYER' | 'SELLER';
  statusFilter?: string;
  page?: number;
  limit?: number;
}) => {
  const { userId, type, statusFilter, page = 1, limit = 20 } = params;
  const skip = (page - 1) * limit;
  const where: Prisma.NegotiationWhereInput =
    type === 'BUYER' ? { buyerId: userId } : { sellerId: userId };

  if (
    statusFilter &&
    Object.values(NegotiationStatus).includes(statusFilter as NegotiationStatus)
  ) {
    where.status = statusFilter as NegotiationStatus;
  }

  const [negotiations, total] = await Promise.all([
    prisma.negotiation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        product: {
          select: { id: true, name: true, pricePerUnit: true, unit: true, biomassaType: true },
        },
        buyer: { select: { id: true, fullName: true } },
        seller: { select: { id: true, fullName: true } },
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
  return prisma.negotiation.updateMany({
    where: {
      status: { in: [NegotiationStatus.OPEN_NEGOTIATION, NegotiationStatus.OFFER_SUBMITTED] },
      updatedAt: { lt: expiryThreshold },
    },
    data: { status: NegotiationStatus.EXPIRED },
  });
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

  const updated = await prisma.negotiation.update({
    where: { id },
    data: {
      status: status as NegotiationStatus,
      quantity: finalQty,
      pricePerUnit: finalPrice,
      totalEstimate: finalTotal,
      specifications: updateData?.specifications ?? negotiation.specifications,
      taxStatus: updateData?.taxStatus ?? negotiation.taxStatus,
      messages: {
        create: {
          senderId: sellerId,
          content:
            status === NegotiationStatus.OFFER_ACCEPTED
              ? `Penawaran disetujui! Nilai final: Rp ${finalPrice}/Unit untuk ${finalQty} satuan. Saya akan segera merilis Kontrak dan Tagihan.`
              : 'Maaf, penawaran ditolak.',
          isSystemMessage: true,
        },
      },
    },
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

  // Chat Locking Logic (Integritas Data B2B)
  const FINAL_STATUSES: string[] = [
    NegotiationStatus.LOCKED,
    NegotiationStatus.OFFER_REJECTED,
    NegotiationStatus.EXPIRED,
    NegotiationStatus.CANCELLED,
  ];
  if (FINAL_STATUSES.includes(negotiation.status)) {
    throw new AppError(`Chat ditutup karena status negosiasi sudah ${negotiation.status}.`, 400);
  }

  return prisma.chatMessage.create({
    data: {
      negotiationId,
      senderId,
      content,
      attachmentUrl,
    },
  });
};

/**
 * 5. List Chat Messages
 */
export const listChatMessages = async (
  negotiationId: string,
  userId: string,
  page: number = 1,
  limit: number = 50,
) => {
  const skip = (page - 1) * limit;
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
      include: {
        sender: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      },
    }),
    prisma.chatMessage.count({ where: { negotiationId } }),
  ]);

  return {
    data: messages,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * 6. Get Negotiation Detail by ID
 * Callable by: BUYER or SELLER that are participants
 */
export const getNegotiationById = async (id: string, userId: string) => {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          pricePerUnit: true,
          unit: true,
          biomassaType: true,
          thumbnailUrl: true,
        },
      },
      buyer: { select: { id: true, fullName: true, avatarUrl: true } },
      seller: { select: { id: true, fullName: true, avatarUrl: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
        },
      },
    },
  });

  if (!negotiation) throw new AppError('Negosiasi tidak ditemukan.', 404);
  if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
    throw new AppError('Anda bukan partisipan dalam negosiasi ini.', 403);
  }

  return negotiation;
};
