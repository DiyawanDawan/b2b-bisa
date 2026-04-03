import crypto from 'crypto';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import {
  Prisma,
  OrderStatus,
  TransactionStatus,
  PaymentStatus,
  PlatformFeeType,
  FeeCalculationType,
  NegotiationStatus,
  TransactionType,
  PaymentMethod,
} from '#prisma';
import { Xendit } from 'xendit-node';
import { withRetry } from '#utils/retry.util';
import { mapMethodToPaymentKey, mapMethodToXenditType } from '#utils/paymentMethod.util';

const getInvoiceRuntimeConfig = async () => {
  const keys = ['XENDIT_INVOICE_DURATION_SECONDS', 'XENDIT_DEFAULT_INVOICE_CATEGORY'] as const;
  const settings = await prisma.platformSetting.findMany({
    where: { key: { in: [...keys] } },
    select: { key: true, value: true },
  });
  const lookup = new Map(settings.map((item) => [item.key, item.value]));

  const durationFromDb = Number(lookup.get('XENDIT_INVOICE_DURATION_SECONDS'));
  const invoiceDuration =
    Number.isFinite(durationFromDb) && durationFromDb > 0 ? durationFromDb : 86400;

  return {
    invoiceDuration,
    defaultInvoiceCategory: lookup.get('XENDIT_DEFAULT_INVOICE_CATEGORY') || 'BIOMASS',
  };
};

/**
 * 1. Supplier creates definitive B2B Contract/Invoice
 */
export const createContract = async (
  sellerId: string,
  data: { negotiationId: string; shippingAddress: string },
) => {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: data.negotiationId },
    include: {
      product: {
        include: { technicalSpec: true },
      },
      buyer: true,
    },
  });

  if (!negotiation) throw new AppError('Data negosiasi tidak ditemukan.', 404);
  if (negotiation.sellerId !== sellerId) throw new AppError('Anda tidak memiliki akses.', 403);
  if (negotiation.status !== NegotiationStatus.OFFER_ACCEPTED)
    throw new AppError(
      'Tawaran harus disetujui (OFFER_ACCEPTED) sebelum bisa dibuat kontrak.',
      400,
    );
  if (negotiation.isLocked) throw new AppError('Kontrak untuk penawaran ini sudah dicetak.', 409);

  // 1. Ambil Pengaturan Fee Platform Secara Dinamis
  const [feeSetting, vatSetting] = await Promise.all([
    prisma.platformFeeSetting.findUnique({
      where: { name: PlatformFeeType.TRANSACTION_FEE },
    }),
    prisma.platformFeeSetting.findUnique({
      where: { name: PlatformFeeType.VAT },
    }),
  ]);

  if (!feeSetting || !feeSetting.isActive) {
    throw new AppError(
      'Konfigurasi biaya layanan (Platform Fee) tidak ditemukan atau tidak aktif. Harap hubungi administrator.',
      500,
    );
  }

  if (!vatSetting || !vatSetting.isActive) {
    throw new AppError(
      'Konfigurasi PPN (VAT) tidak ditemukan atau tidak aktif. Harap hubungi administrator.',
      500,
    );
  }

  // Kalkulasi Finansial
  const subtotal = negotiation.totalEstimate;
  let platformFee: Prisma.Decimal;

  if (feeSetting.type === FeeCalculationType.PERCENTAGE) {
    const percentage = new Prisma.Decimal(feeSetting.amount.toString()).div(100);
    platformFee = subtotal.mul(percentage);
  } else {
    platformFee = new Prisma.Decimal(feeSetting.amount.toString());
  }

  let vatAmount: Prisma.Decimal;
  if (vatSetting.type === FeeCalculationType.PERCENTAGE) {
    const vatPercentage = new Prisma.Decimal(vatSetting.amount.toString()).div(100);
    vatAmount = subtotal.mul(vatPercentage);
  } else {
    vatAmount = new Prisma.Decimal(vatSetting.amount.toString());
  }

  const totalAmount = subtotal.add(platformFee).add(vatAmount);

  // LOGIKA SMART DESCRIPTION: Menggabungkan spek teknis & kesepakatan chat
  const ts = negotiation.product.technicalSpec;
  let smartDescription = `${negotiation.product.name} B2B Trade. `;

  if (ts) {
    const specs = [];
    if (ts.carbonPurity) specs.push(`${ts.carbonPurity}% Carbon`);
    if (ts.phLevel) specs.push(`${ts.phLevel} pH`);
    if (ts.moistureContent) specs.push(`${ts.moistureContent}% Moisture`);
    if (specs.length > 0) smartDescription += `Specs: ${specs.join(', ')}. `;
  }

  // Tambahkan hasil negosiasi chat jika ada
  if (negotiation.specifications) {
    smartDescription += `Agreed Terms: ${negotiation.specifications}`;
  }

  // BISA-YYYYMMDD-XXXX
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = crypto.randomBytes(3).toString('hex').toUpperCase();
  const orderNumber = `B2B-${dateStr}-${randomStr}`;
  const transactionExternalId = `TRX-${orderNumber}`;

  // Eksekusi Pembuatan DB dalam Prisma Transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Lock Negotiation
    await tx.negotiation.update({
      where: { id: negotiation.id },
      data: {
        isLocked: true,
        status: NegotiationStatus.LOCKED,
        messages: {
          create: {
            senderId: sellerId,
            content: 'Kontrak Digital dan Tagihan Resmi telah diterbitkan.',
            isSystemMessage: true,
          },
        },
      },
    });

    // 2. Buat Order & Tracker
    const order = await tx.order.create({
      data: {
        buyerId: negotiation.buyerId,
        sellerId: negotiation.sellerId,
        orderNumber,
        subtotal,
        platformFee,
        logisticsFee: new Prisma.Decimal(0),
        vatAmount,
        totalAmount,
        totalQuantity: negotiation.quantity,
        shippingAddressSnapshot: { address: data.shippingAddress },
        status: OrderStatus.PENDING,
        specifications: negotiation.specifications || smartDescription,
        items: {
          create: {
            productId: negotiation.productId,
            quantity: negotiation.quantity,
            pricePerUnit: negotiation.pricePerUnit,
            subtotal,
          },
        },
        shipment: {
          create: {
            vesselName: 'Menunggu Pengiriman',
          },
        },
      },
    });

    // 3. Connect Negotiation ke Order
    await tx.negotiation.update({
      where: { id: negotiation.id },
      data: { orderId: order.id },
    });

    // 4. Buat Transaction Awal
    const transaction = await tx.transaction.create({
      data: {
        orderId: order.id,
        userId: negotiation.buyerId,
        amount: totalAmount,
        platformFee,
        sellerAmount: subtotal, // Supplier hanya berhak atas harga barang
        externalId: transactionExternalId,
        status: TransactionStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        type: TransactionType.SALES,
      },
    });

    return { order, transaction, buyer: negotiation.buyer, smartDescription };
  });

  return result;
};

/**
 * 1b. Buyer Initializes Payment (Dual-Mode: Invoice for Redirect / PaymentRequest for Direct Data)
 * Deteksi otomatis: channelCode ada → PaymentRequest V3 (Direct), tidak ada → Invoice (Redirect)
 */
export const initializePayment = async (orderId: string, buyerId: string, channelCode?: string) => {
  // 1. Validasi Order (Dinamis: Include Buyer untuk Metadata)
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      transaction: true,
      buyer: { select: { fullName: true, email: true } },
      items: { include: { product: true } },
    },
  });

  if (!order) throw new AppError('Pesanan tidak ditemukan.', 404);
  if (order.buyerId !== buyerId) throw new AppError('Anda bukan pembeli pesanan ini.', 403);
  if (order.status !== OrderStatus.PENDING)
    throw new AppError('Pesanan ini sudah diproses atau dibayar.', 400);
  if (!order.transaction) throw new AppError('Data transaksi tidak ditemukan.', 500);

  // Cek apakah sudah pernah bayar (idempotency)
  if (order.transaction.paymentRequestId || order.transaction.xenditInvoiceId) {
    throw new AppError(
      'Pembayaran sudah diinisialisasi sebelumnya. Gunakan data pembayaran yang sudah ada.',
      409,
    );
  }

  const amount = Number(order.totalAmount.toString());
  const description = (order.specifications as string) || `Pembayaran Order ${order.orderNumber}`;

  // 2. Cari Channel dan Grupnya di Database (Admin & Dynamic mapping)
  let channel: {
    code: string;
    name: string;
    isActive: boolean;
    group: PaymentMethod | null;
  } | null = null;
  if (channelCode) {
    channel = (await prisma.paymentChannel.findFirst({
      where: { code: channelCode.toUpperCase() },
    })) as any; // Cast for now until prisma generate is confirmed sync
    if (!channel) throw new AppError(`Metode pembayaran "${channelCode}" tidak ditemukan.`, 404);
    if (!channel.isActive)
      throw new AppError(
        `Metode pembayaran "${channel.name}" sedang tidak tersedia. Silakan pilih metode lain.`,
        503,
      );
  }

  const xenditKey = process.env.XENDIT_PAYMENT_SECRET_KEY;
  if (!xenditKey) {
    throw new AppError('Xendit config missing: XENDIT_PAYMENT_SECRET_KEY is required.', 500);
  }

  const xenditClient = new Xendit({
    secretKey: xenditKey,
  });

  // ═══════════════════════════════════════════════════════════════
  // MODE DIRECT (channelCode) → Payment Request V3 (Zero Hardcode)
  // ═══════════════════════════════════════════════════════════════
  if (channelCode && channel) {
    const methodGroup = channel.group || PaymentMethod.BANK_TRANSFER;
    const xenditType = mapMethodToXenditType(methodGroup);
    const paymentMethodKey = mapMethodToPaymentKey(xenditType);
    const upperCode = channel.code.toUpperCase();

    // Bangun properti tambahan per grup secara dinamis
    const props: Record<string, any> = {};
    if (methodGroup === PaymentMethod.E_WALLET) {
      props.success_return_url = `${process.env.CORS_ORIGINS?.split(',')[0] || 'http://localhost:3000'}/payment/success`;
    } else if (methodGroup === PaymentMethod.BANK_TRANSFER) {
      props.customerName = order.buyer?.fullName || 'BISA B2B Buyer';
    }

    const paymentMethodPayload: Record<string, unknown> = {
      type: xenditType,
      reusability: 'ONE_TIME_USE',
      [paymentMethodKey]: {
        channelCode: upperCode,
        channelProperties: Object.keys(props).length > 0 ? props : undefined,
      },
    };

    const paymentRequest = await withRetry(() =>
      xenditClient.PaymentRequest.createPaymentRequest({
        data: {
          referenceId: order.transaction!.externalId || `TRX-${order.orderNumber}`,
          amount,
          currency: 'IDR',
          paymentMethod: paymentMethodPayload as any,
          metadata: {
            orderNumber: order.orderNumber,
            orderId: order.id,
          },
        },
      }),
    );

    // Simpan ke database
    await prisma.transaction.update({
      where: { id: order.transaction.id },
      data: {
        paymentRequestId: paymentRequest.id,
        providerActions: paymentRequest as unknown as Prisma.InputJsonValue,
      },
    });

    // GENERIC DATA EXTRACTOR
    const resPayload = paymentRequest as unknown as Record<string, any>;
    const pm = resPayload.payment_method as Record<string, any> | undefined;
    const actions =
      (resPayload.actions as Array<{ action?: string; url?: string; qr_code?: string }>) || [];
    const paymentType = (pm?.type as string) || 'UNKNOWN';
    const specificData = (pm?.[paymentMethodKey] as Record<string, any>) || {};

    return {
      mode: 'DIRECT',
      paymentRequestId: paymentRequest.id,
      paymentType,
      channelCode: (specificData.channel_code as string) || upperCode,
      paymentData: {
        ...specificData.channel_properties,
        actions: actions.length > 0 ? actions : undefined,
        qrString: actions.find((a) => a.action === 'PRESENT_QR' || a.qr_code)?.qr_code,
        redirectUrl: actions.find((a) => a.url)?.url,
      },
      amount,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // MODE WEB (tanpa channelCode) → Invoice (Hosted Checkout)
  // ═══════════════════════════════════════════════════════════════
  const invoiceRuntimeConfig = await getInvoiceRuntimeConfig();
  const invoice = await withRetry(() =>
    xenditClient.Invoice.createInvoice({
      data: {
        externalId: order.transaction!.externalId || `TRX-${order.orderNumber}`,
        amount,
        description: description.substring(0, 250),
        currency: 'IDR',
        invoiceDuration: invoiceRuntimeConfig.invoiceDuration,
        items: order.items.map((item) => ({
          name: item.product?.name || 'Biochar Product',
          quantity: Number(item.quantity.toString()),
          price: Number(item.pricePerUnit.toString()),
          category: item.product?.biomassaType || invoiceRuntimeConfig.defaultInvoiceCategory,
        })),
        successRedirectUrl: `${
          process.env.CORS_ORIGINS?.split(',')[0] || 'http://localhost:3000'
        }/payment/success`,
        failureRedirectUrl: `${
          process.env.CORS_ORIGINS?.split(',')[0] || 'http://localhost:3000'
        }/payment/failed`,
      },
    }),
  );

  // Simpan ke database
  const invoicePayload = invoice as Record<string, any>;
  await prisma.transaction.update({
    where: { id: order.transaction.id },
    data: {
      xenditInvoiceId: invoicePayload.id,
      paymentUrl: invoicePayload.invoice_url || invoicePayload.invoiceUrl,
      providerActions: invoice as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    mode: 'WEB',
    invoiceId: invoicePayload.id,
    invoiceUrl: invoicePayload.invoice_url || invoicePayload.invoiceUrl,
    amount,
    expiryDate: invoicePayload.expiry_date || invoicePayload.expiryDate,
  };
};

/**
 * 2. List Purchasing / Sales Log with Pagination
 */
export const listOrdersByRole = async (params: {
  userId: string;
  role: 'BUYER' | 'SELLER';
  statusFilter?: string;
  page?: number;
  limit?: number;
}) => {
  const { userId, role, statusFilter, page = 1, limit = 20 } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.OrderWhereInput =
    role === 'BUYER' ? { buyerId: userId } : { sellerId: userId };

  if (statusFilter && Object.values(OrderStatus).includes(statusFilter as OrderStatus)) {
    where.status = statusFilter as OrderStatus;
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { product: { select: { name: true, biomassaType: true } } } },
        buyer: { select: { fullName: true } },
        seller: { select: { fullName: true } },
        transaction: { select: { status: true, paymentUrl: true, paidAt: true } },
        shipment: true,
      },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    data: orders,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * 3. Update Shipment Tracking
 */
export const updateShipmentTracking = async (
  orderId: string,
  sellerId: string,
  data: {
    vesselName: string;
    originHub?: string;
    destinationHub?: string;
    latitude?: number;
    longitude?: number;
  },
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { shipment: true },
  });

  if (!order || !order.shipment)
    throw new AppError('Data pengiriman pesanan tidak ditemukan.', 404);
  if (order.sellerId !== sellerId)
    throw new AppError('Hanya Penyuplai yang bisa update resi.', 403);
  if (order.status === OrderStatus.PENDING)
    throw new AppError('Pesanan belum dilunasi Buyer.', 400);

  // Update order status if currently simply PROCESSING
  if (order.status === OrderStatus.PROCESSING) {
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.SHIPPED } });
  }

  return prisma.shipmentTracking.update({
    where: { orderId },
    data: {
      vesselName: data.vesselName,
      originHub: data.originHub,
      destinationHub: data.destinationHub,
      currentLat: data.latitude ? new Prisma.Decimal(data.latitude) : undefined,
      currentLng: data.longitude ? new Prisma.Decimal(data.longitude) : undefined,
    },
  });
};

/**
 * 4. Get Detail Order
 */
export const getOrderDetail = async (id: string, userId: string) => {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: true } },
      transaction: true,
      shipment: true,
      negotiation: { select: { messages: true } },
    },
  });

  if (!order) throw new AppError('Pesanan tidak ditemukan', 404);
  if (order.buyerId !== userId && order.sellerId !== userId)
    throw new AppError('Akses Ditolak', 403);

  // Ekstraksi QR Kontrak Dummy
  const digitalQRData = `${order.orderNumber}:VERIFIED:${order.createdAt.getTime()}`;

  return { ...order, digitalContractQrData: digitalQRData };
};

/**
 * 5. Raise Dispute (Buyer Mengajukan Komplain)
 */
export const raiseDispute = async (orderId: string, buyerId: string, reason: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { transaction: true },
  });

  if (!order) throw new AppError('Pesanan tidak ditemukan.', 404);
  if (order.buyerId !== buyerId)
    throw new AppError('Hanya pembeli yang bisa mengajukan sengketa.', 403);

  const allowedStatuses: string[] = [OrderStatus.SHIPPED, OrderStatus.PROCESSING];
  if (!allowedStatuses.includes(order.status)) {
    throw new AppError(
      'Sengketa hanya bisa diajukan untuk pesanan yang sedang diproses atau dikirim.',
      400,
    );
  }

  return prisma.$transaction(async (tx) => {
    // 1. Update Order => DISPUTED
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.DISPUTED },
    });

    // 2. Catat alasan di Chat Negosiasi
    await tx.negotiation.update({
      where: { orderId },
      data: {
        messages: {
          create: {
            senderId: buyerId,
            content: `⚠️ SENGKETA DIAJUKAN: ${reason}`,
            isSystemMessage: true,
          },
        },
      },
    });

    return updatedOrder;
  });
};

/**
 * 6. Public Contract Verification (Untuk QR Scan Logistik)
 * Tidak memerlukan Auth, hanya mengembalikan data publik terbatas.
 */
export const getPublicContractVerification = async (orderNumber: string) => {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdAt: true,
      totalQuantity: true,
      specifications: true,
      seller: {
        select: { fullName: true },
      },
      items: {
        select: {
          product: { select: { name: true, biomassaType: true } },
        },
      },
    },
  });

  if (!order)
    throw new AppError('Kontrak B2B dengan nomor tersebut tidak valid atau tidak ditemukan.', 404);

  return {
    ...order,
    verificationStatus: 'VERIFIED_BY_BISA_B2B',
    timestamp: new Date(),
  };
};
