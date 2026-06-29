import crypto from 'crypto';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import {
  assertQuantityMeetsMinOrder,
  assertDirectCheckoutItem,
  assertSampleCheckoutShape,
  directCheckoutProductSelect,
  resolveCheckoutUnitPrice,
} from '#utils/productOrderRules';
import { assertBuyerCommerceReady } from '#utils/readiness.util';
import {
  Prisma,
  OrderStatus,
  DisputeStatus,
  TransactionStatus,
  PaymentStatus,
  PlatformFeeType,
  FeeCalculationType,
  NegotiationStatus,
  TransactionType,
  PaymentMethod,
  UserRole,
  NotificationType,
  NotificationPriority,
} from '#prisma';
import { createNotification } from '#services/notification.service';
import * as rajaOngkirService from '#services/rajaongkir.service';
import {
  getSupplierShippingOrigin,
  persistOrderShipping,
} from '#services/order-shipping.service';
import type { LogisticsSnapshotMeta, ShippingSelectionInput } from '#types/order-shipping';
import { notifyOrderStatusChange } from '#services/orderNotification.service';
import { scheduleSupplyDemandRefresh } from '#services/marketSupplyDemand.service';
import { ensureDisputeNegotiationRoom } from '#services/dispute-mediation.service';
import {
  validateVoucherForCheckout,
  allocateVoucherDiscount,
  redeemVoucherForOrder,
} from '#services/voucher.service';
import { saveUserPaymentPreference } from '#services/saved-payment.service';
import { Xendit } from 'xendit-node';
import { withRetry } from '#utils/retry.util';
import { shouldFallbackXenditDirectToInvoice, translateXenditError } from '#utils/xenditError.util';
import {
  buildMockPaymentInitResult,
  isMockProviderActions,
  isXenditMockPaymentEnabled,
  shouldUseXenditMockOnForbidden,
} from '#utils/xenditMock.util';
import { applyPaymentSucceededWebhook, isXenditWebhookDevMode } from '#utils/xenditWebhookDev.util';
import { resolveXenditPaymentSecretKey } from '#utils/env.util';
import {
  cancelPaymentRequestV3,
  simulatePaymentRequestV3,
  sleep,
} from '#utils/xenditPaymentRequestV3.util';
import {
  extractPaymentExpiryDate,
  extractXenditDirectPaymentData,
  mapMethodToPaymentKey,
  mapMethodToXenditType,
  paymentDataHasPayableDetail,
} from '#utils/paymentMethod.util';
import { attachOrderMediaUrls } from '#utils/orderMedia.util';
import { buildBisaTrackingNumber } from '#utils/order-tracking.util';
import * as storageService from '#services/storage.service';
import { roundIdrAmount, roundIdrDecimal } from '#utils/currency.util';
import { resolveProviderActions, sealProviderActions } from '#utils/encryption.util';
import {
  BATCH_PAYMENT_EXTERNAL_PREFIX,
  BISA_MULTI_CHECKOUT_ORDER_PREFIX,
  isMultiCheckoutPaymentExternalId,
  parseCheckoutBatchIdFromExternalId,
} from '#constants/order.constants';

export {
  BATCH_PAYMENT_EXTERNAL_PREFIX,
  BISA_MULTI_CHECKOUT_PAYMENT_PREFIX,
  BISA_MULTI_CHECKOUT_ORDER_PREFIX,
  isMultiCheckoutPaymentExternalId,
  parseCheckoutBatchIdFromExternalId,
} from '#constants/order.constants';

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

type ShippingAddressSnapshot = {
  recipient: string;
  phone?: string | null;
  email?: string | null;
  address: string;
  zipCode?: string | null;
  province?: string | null;
  regency?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Sumber data: profil pembeli, alamat tersimpan, atau kustom supplier. */
  source?: 'buyer_profile' | 'buyer_saved_address' | 'custom';
  customerAddressId?: string | null;
};

const mergeShippingSnapshot = (
  base: ShippingAddressSnapshot,
  override?: Partial<ShippingAddressSnapshot>,
): ShippingAddressSnapshot => {
  if (!override) return base;
  return {
    recipient: override.recipient?.trim() || base.recipient,
    phone: override.phone?.trim() || base.phone,
    email: override.email?.trim() || base.email,
    address: override.address?.trim() || base.address,
    zipCode: override.zipCode?.trim() || base.zipCode,
    province: override.province?.trim() || base.province,
    regency: override.regency?.trim() || base.regency,
    latitude: override.latitude ?? base.latitude,
    longitude: override.longitude ?? base.longitude,
    source: override.source ?? base.source,
    customerAddressId: override.customerAddressId ?? base.customerAddressId,
  };
};

const addressSelect = {
  fullAddress: true,
  zipCode: true,
  phoneNumber: true,
  latitude: true,
  longitude: true,
  province: { select: { name: true } },
  regency: { select: { name: true } },
} as const;

const snapshotFromLinkedAddress = (
  buyer: {
    fullName: string;
    email: string | null;
    phone: string | null;
    regency: string | null;
  },
  linkedAddress: {
    fullAddress: string;
    zipCode: string;
    phoneNumber: string | null;
    latitude: Prisma.Decimal;
    longitude: Prisma.Decimal;
    province?: { name: string } | null;
    regency?: { name: string } | null;
  },
  meta?: { source?: ShippingAddressSnapshot['source']; customerAddressId?: string },
): ShippingAddressSnapshot => ({
  recipient: buyer.fullName,
  phone: linkedAddress.phoneNumber ?? buyer.phone,
  email: buyer.email,
  address: linkedAddress.fullAddress,
  zipCode: linkedAddress.zipCode,
  province: linkedAddress.province?.name,
  regency: linkedAddress.regency?.name ?? buyer.regency,
  latitude: Number(linkedAddress.latitude),
  longitude: Number(linkedAddress.longitude),
  source: meta?.source ?? 'buyer_profile',
  customerAddressId: meta?.customerAddressId ?? null,
});

const resolveBuyerShippingSnapshot = async (
  buyerId: string,
  override?: string,
): Promise<ShippingAddressSnapshot> => {
  const buyer = await prisma.user.findUnique({
    where: { id: buyerId },
    select: {
      fullName: true,
      email: true,
      phone: true,
      regency: true,
      address: { select: addressSelect },
      customerAddresses: {
        orderBy: { isPrimary: 'desc' },
        take: 1,
        select: {
          id: true,
          address: { select: addressSelect },
        },
      },
    },
  });

  if (!buyer) throw new AppError('Data pembeli tidak ditemukan.', 404);

  if (override && override.trim().length >= 10) {
    const primary = buyer.customerAddresses[0]?.address ?? buyer.address ?? null;
    return {
      recipient: buyer.fullName,
      phone: buyer.phone,
      email: buyer.email,
      address: override.trim(),
      regency: buyer.regency,
      zipCode: primary?.zipCode,
      province: primary?.province?.name,
      latitude: primary ? Number(primary.latitude) : undefined,
      longitude: primary ? Number(primary.longitude) : undefined,
      source: 'custom',
    };
  }

  const primaryCustomer = buyer.customerAddresses[0];
  const linkedAddress = primaryCustomer?.address ?? buyer.address ?? null;

  if (!linkedAddress?.fullAddress) {
    throw new AppError(
      'Pembeli belum memiliki alamat pengiriman. Minta pembeli melengkapi alamat di profil terlebih dahulu.',
      400,
    );
  }

  return snapshotFromLinkedAddress(buyer, linkedAddress, {
    source: primaryCustomer ? 'buyer_saved_address' : 'buyer_profile',
    customerAddressId: primaryCustomer?.id,
  });
};

/**
 * Daftar alamat pengiriman pembeli untuk supplier saat buat tagihan negosiasi.
 */
export const listBuyerShippingAddressesForNegotiation = async (
  negotiationId: string,
  sellerId: string,
) => {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
    select: { buyerId: true, sellerId: true },
  });

  if (!negotiation) throw new AppError('Data negosiasi tidak ditemukan.', 404);
  if (negotiation.sellerId !== sellerId) {
    throw new AppError('Anda tidak memiliki akses ke alamat pembeli ini.', 403);
  }

  const buyer = await prisma.user.findUnique({
    where: { id: negotiation.buyerId },
    select: {
      fullName: true,
      email: true,
      phone: true,
      regency: true,
      address: { select: addressSelect },
      customerAddresses: {
        orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          label: true,
          isPrimary: true,
          address: { select: addressSelect },
        },
      },
    },
  });

  if (!buyer) throw new AppError('Data pembeli tidak ditemukan.', 404);

  const savedAddresses = buyer.customerAddresses
    .filter((row) => row.address?.fullAddress)
    .map((row) => ({
      id: row.id,
      label: row.label,
      isPrimary: row.isPrimary,
      snapshot: snapshotFromLinkedAddress(buyer, row.address, {
        source: 'buyer_saved_address',
        customerAddressId: row.id,
      }),
    }));

  let profileAddress: ShippingAddressSnapshot | null = null;
  if (buyer.address?.fullAddress) {
    profileAddress = snapshotFromLinkedAddress(buyer, buyer.address, {
      source: 'buyer_profile',
    });
  }

  let defaultSnapshot: ShippingAddressSnapshot;
  try {
    defaultSnapshot = await resolveBuyerShippingSnapshot(negotiation.buyerId);
  } catch {
    defaultSnapshot =
      savedAddresses.find((a) => a.isPrimary)?.snapshot ??
      savedAddresses[0]?.snapshot ??
      profileAddress ?? {
        recipient: buyer.fullName,
        phone: buyer.phone,
        email: buyer.email,
        address: '',
        regency: buyer.regency,
        source: 'buyer_profile',
      };
  }

  const isSameSnapshot = (a: ShippingAddressSnapshot, b: ShippingAddressSnapshot) =>
    (a.customerAddressId &&
      b.customerAddressId &&
      a.customerAddressId === b.customerAddressId) ||
    (a.address.trim() === b.address.trim() &&
      (a.regency ?? '') === (b.regency ?? '') &&
      (a.province ?? '') === (b.province ?? ''));

  type BuyerAddressOption = {
    key: string;
    label: string;
    isPrimary: boolean;
    isDefault: boolean;
    snapshot: ShippingAddressSnapshot;
  };

  const addresses: BuyerAddressOption[] = [];

  if (profileAddress?.address?.trim()) {
    addresses.push({
      key: 'profile',
      label: 'Profil pembeli',
      isPrimary: false,
      isDefault: isSameSnapshot(profileAddress, defaultSnapshot),
      snapshot: profileAddress,
    });
  }

  for (const row of savedAddresses) {
    addresses.push({
      key: row.id,
      label: row.label?.trim() || 'Alamat tersimpan',
      isPrimary: row.isPrimary,
      isDefault: isSameSnapshot(row.snapshot, defaultSnapshot),
      snapshot: row.snapshot,
    });
  }

  addresses.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return {
    defaultSnapshot,
    profileAddress,
    savedAddresses,
    addresses,
  };
};

/** Alamat asal pengiriman supplier (profil toko / verifikasi bisnis / lokasi produk). */
export const resolveSellerShippingSnapshot = async (
  sellerId: string,
  productLocation?: { regency: string | null; province: string | null },
): Promise<ShippingAddressSnapshot> => {
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      fullName: true,
      email: true,
      phone: true,
      regency: true,
      profile: {
        select: {
          companyName: true,
          address: { select: addressSelect },
        },
      },
      verification: {
        select: { businessName: true, businessAddress: true },
      },
    },
  });

  if (!seller) throw new AppError('Data supplier tidak ditemukan.', 404);

  const companyName =
    seller.profile?.companyName?.trim() ||
    seller.verification?.businessName?.trim() ||
    seller.fullName;
  const linked = seller.profile?.address ?? null;
  const businessAddress = seller.verification?.businessAddress?.trim() ?? '';
  const regencyName =
    linked?.regency?.name?.trim() ||
    seller.regency?.trim() ||
    productLocation?.regency?.trim() ||
    '';
  const provinceName =
    linked?.province?.name?.trim() || productLocation?.province?.trim() || '';
  const street =
    linked?.fullAddress?.trim() ||
    businessAddress ||
    [regencyName, provinceName].filter(Boolean).join(', ');

  return {
    recipient: companyName,
    phone: linked?.phoneNumber ?? seller.phone,
    email: seller.email,
    address: street,
    zipCode: linked?.zipCode,
    province: provinceName || undefined,
    regency: regencyName || undefined,
    latitude: linked ? Number(linked.latitude) : undefined,
    longitude: linked ? Number(linked.longitude) : undefined,
    source: linked?.fullAddress
      ? 'seller_profile'
      : businessAddress
        ? 'seller_business'
        : 'seller_product_location',
  };
};

/** Origin RajaOngkir: profil supplier, lalu cari otomatis dari lokasi toko/produk. */
export const resolveSellerShippingOrigin = async (
  sellerId: string,
  productLocation?: { regency: string | null; province: string | null },
) => {
  const stored = await getSupplierShippingOrigin(sellerId);
  const snapshot = await resolveSellerShippingSnapshot(sellerId, productLocation);

  if (stored.originId != null) {
    return {
      snapshot,
      originId: stored.originId,
      originLabel: stored.originLabel ?? snapshot.regency,
      resolvedFrom: 'rajaongkir_profile' as const,
    };
  }

  const queries = [
    stored.originLabel?.trim(),
    snapshot.regency && snapshot.province
      ? `${snapshot.regency}, ${snapshot.province}`
      : null,
    snapshot.regency?.trim(),
    snapshot.province?.trim(),
  ].filter((q): q is string => !!q && q.length >= 2);

  for (const query of queries) {
    const results = await rajaOngkirService.searchDomesticDestinations({
      search: query,
      limit: 8,
    });
    if (results.length > 0) {
      const first = results[0];
      const originId = Number(first.id);
      if (!Number.isNaN(originId)) {
        return {
          snapshot,
          originId,
          originLabel: first.label ?? query,
          resolvedFrom: 'auto_search' as const,
        };
      }
    }
  }

  return {
    snapshot,
    originId: null as number | null,
    originLabel: stored.originLabel ?? snapshot.regency ?? null,
    resolvedFrom: 'unresolved' as const,
  };
};

type ContractFinancials = {
  subtotal: Prisma.Decimal;
  platformFee: Prisma.Decimal;
  logisticsFee: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
};

const calculateContractFinancials = async (
  subtotalInput: Prisma.Decimal,
  logisticsFeeInput: Prisma.Decimal = new Prisma.Decimal(0),
): Promise<ContractFinancials> => {
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

  const subtotal = subtotalInput;
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

  platformFee = roundIdrDecimal(platformFee);
  vatAmount = roundIdrDecimal(vatAmount);
  const logisticsFee = roundIdrDecimal(logisticsFeeInput);
  const totalAmount = roundIdrDecimal(subtotal.add(platformFee).add(vatAmount).add(logisticsFee));

  return {
    subtotal: roundIdrDecimal(subtotal),
    platformFee,
    logisticsFee,
    vatAmount,
    totalAmount,
  };
};

/** Ringkasan harga katalog vs nego, diskon %, stok, estimasi bersih supplier (tanpa ongkir). */
export const buildDealEconomics = async (params: {
  catalogPricePerUnit: number;
  negotiatedPricePerUnit: number;
  quantity: number;
  productStock: number;
  unit: string;
}) => {
  const { catalogPricePerUnit: catalogUnit, negotiatedPricePerUnit: negoUnit, quantity: qtyNum, productStock: stockNum, unit } =
    params;
  const subtotalInput = new Prisma.Decimal(negoUnit).mul(qtyNum);
  const { platformFee: platformFeeDec, subtotal: subtotalDec } =
    await calculateContractFinancials(subtotalInput, new Prisma.Decimal(0));
  const catalogSubtotal = catalogUnit * qtyNum;
  const negoSubtotal = Number(subtotalDec);
  const savingsTotal = catalogSubtotal - negoSubtotal;
  const platformFeeNum = Number(platformFeeDec);
  const sellerNet = negoSubtotal - platformFeeNum;
  const roundPct = (v: number) => Math.round(v * 10) / 10;

  return {
    catalogPricePerUnit: catalogUnit,
    negotiatedPricePerUnit: negoUnit,
    quantity: qtyNum,
    unit,
    catalogSubtotal,
    negotiatedSubtotal: negoSubtotal,
    discountPercentPerUnit:
      catalogUnit > 0 ? roundPct(((catalogUnit - negoUnit) / catalogUnit) * 100) : 0,
    discountPercentTotal:
      catalogSubtotal > 0 ? roundPct((savingsTotal / catalogSubtotal) * 100) : 0,
    savingsTotal,
    productStock: stockNum,
    stockAfterDeal: Math.max(0, stockNum - qtyNum),
    platformFee: platformFeeNum,
    sellerNetEstimate: sellerNet,
    platformFeePercent: negoSubtotal > 0 ? roundPct((platformFeeNum / negoSubtotal) * 100) : 0,
  };
};

const resolveLogisticsForCheckout = async (
  selection: ShippingSelectionInput | undefined,
): Promise<{ logisticsFee: Prisma.Decimal; logisticsMeta?: LogisticsSnapshotMeta }> => {
  if (!selection) {
    return { logisticsFee: new Prisma.Decimal(0) };
  }

  const verified = await rajaOngkirService.verifyShippingSelection({
    originId: selection.originId,
    destinationId: selection.destinationId,
    weightGrams: selection.weightGrams,
    courierCode: selection.courierCode,
    serviceCode: selection.serviceCode,
    serviceName: selection.serviceName,
    expectedCost: selection.cost,
  });

  return {
    logisticsFee: new Prisma.Decimal(verified.cost),
    logisticsMeta: {
      ...selection,
      verifiedService: verified.service,
      verifiedDescription: verified.description,
      courierName: verified.name,
      serviceName: selection.serviceName ?? verified.service,
    },
  };
};

const attachLogisticsToSnapshot = (
  snapshot: ShippingAddressSnapshot,
  logisticsMeta?: LogisticsSnapshotMeta,
): ShippingAddressSnapshot & { logistics?: LogisticsSnapshotMeta } => {
  if (!logisticsMeta) return snapshot;
  return { ...snapshot, logistics: logisticsMeta };
};

/** Alamat tujuan wajib lengkap sebelum hitung ongkir / terbitkan tagihan. */
const assertShippingDestinationReady = (snapshot: ShippingAddressSnapshot) => {
  const recipient = snapshot.recipient?.trim() ?? '';
  if (recipient.length < 2) {
    throw new AppError('Nama penerima wajib diisi sebelum menerbitkan tagihan.', 400);
  }
  const phone = snapshot.phone?.trim() ?? '';
  if (phone.length < 8) {
    throw new AppError(
      'Nomor telepon penerima wajib diisi (minimal 8 digit) sebelum menerbitkan tagihan.',
      400,
    );
  }
  const address = snapshot.address?.trim() ?? '';
  if (address.length < 10) {
    throw new AppError(
      'Alamat tujuan pengiriman belum lengkap (minimal 10 karakter). Isi alamat penerima terlebih dahulu.',
      400,
    );
  }
  const hasRegion =
    (snapshot.regency?.trim().length ?? 0) > 0 ||
    (snapshot.province?.trim().length ?? 0) > 0;
  if (!hasRegion) {
    throw new AppError(
      'Kabupaten/kota atau provinsi tujuan wajib diisi sebelum menerbitkan tagihan.',
      400,
    );
  }
};

/** Semua data pengiriman & ongkir wajib lengkap sebelum kontrak/tagihan diterbitkan. */
const assertContractIssueReady = (
  mergedSnapshot: ShippingAddressSnapshot,
  shippingSelection: ShippingSelectionInput | undefined,
  sellerOrigin: Awaited<ReturnType<typeof resolveSellerShippingOrigin>>,
) => {
  assertShippingDestinationReady(mergedSnapshot);

  if (!shippingSelection) {
    throw new AppError(
      'Ongkir belum dipilih. Hitung dan pilih layanan kurir terlebih dahulu.',
      400,
    );
  }
  if (!shippingSelection.originId || !shippingSelection.destinationId) {
    throw new AppError('Data asal/tujuan ongkir tidak valid. Pilih ulang ongkir.', 400);
  }
  if (!shippingSelection.courierCode?.trim()) {
    throw new AppError('Kurir pengiriman belum dipilih.', 400);
  }
  const cost = Number(shippingSelection.cost);
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new AppError('Biaya ongkir belum valid. Hitung ulang ongkir.', 400);
  }
  if (!shippingSelection.weightGrams || shippingSelection.weightGrams < 1) {
    throw new AppError('Berat pengiriman tidak valid. Sesuaikan jumlah barang.', 400);
  }

  if (sellerOrigin.originId == null) {
    throw new AppError(
      'Asal pengiriman toko belum bisa ditentukan. Lengkapi alamat bisnis di Profil atau atur lokasi di menu Pengiriman.',
      400,
    );
  }
};

/** Direct checkout wajib punya ongkir valid per supplier (parity tagihan negosiasi). */
const assertDirectCheckoutShippingReady = async (
  sellerIds: string[],
  mergedSnapshot: ShippingAddressSnapshot,
  shippingSelections?: Array<ShippingSelectionInput & { sellerId: string }>,
) => {
  if (!shippingSelections?.length) {
    throw new AppError(
      'Ongkir belum dipilih. Hitung dan pilih layanan kurir untuk setiap supplier.',
      400,
    );
  }

  const selectionBySeller = new Map(
    shippingSelections.map((selection) => [selection.sellerId, selection]),
  );

  for (const sellerId of sellerIds) {
    const shippingSelection = selectionBySeller.get(sellerId);
    if (!shippingSelection) {
      throw new AppError('Ongkir belum dipilih untuk semua supplier.', 400);
    }
    const sellerOrigin = await resolveSellerShippingOrigin(sellerId);
    assertContractIssueReady(mergedSnapshot, shippingSelection, sellerOrigin);
  }
};

/**
 * Preview invoice breakdown before supplier issues contract (no DB writes).
 */
export const previewInvoiceFromNegotiation = async (
  negotiationId: string,
  sellerId: string,
  options?: {
    shippingSelection?: ShippingSelectionInput;
    shippingSnapshot?: Partial<ShippingAddressSnapshot>;
    quantity?: number;
    pricePerUnit?: number;
  },
) => {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      quantity: true,
      pricePerUnit: true,
      totalEstimate: true,
      specifications: true,
      status: true,
      isLocked: true,
      product: {
        select: {
          id: true,
          name: true,
          unit: true,
          thumbnailUrl: true,
          pricePerUnit: true,
          stock: true,
          minOrder: true,
          regency: true,
          province: true,
        },
      },
      buyer: {
        select: {
          id: true,
          fullName: true,
          profile: { select: { companyName: true } },
        },
      },
    },
  });

  if (!negotiation) throw new AppError('Data negosiasi tidak ditemukan.', 404);
  if (negotiation.sellerId !== sellerId) throw new AppError('Anda tidak memiliki akses.', 403);
  if (negotiation.status !== NegotiationStatus.OFFER_ACCEPTED) {
    throw new AppError(
      'Preview tagihan hanya tersedia saat tawaran sudah diterima (OFFER_ACCEPTED).',
      400,
    );
  }
  if (negotiation.isLocked) {
    throw new AppError('Tagihan untuk negosiasi ini sudah diterbitkan.', 409);
  }

  const previewQty =
    options?.quantity != null ? new Prisma.Decimal(options.quantity) : negotiation.quantity;
  const previewPrice =
    options?.pricePerUnit != null
      ? new Prisma.Decimal(options.pricePerUnit)
      : negotiation.pricePerUnit;
  const previewSubtotal = previewQty.mul(previewPrice);

  await assertQuantityMeetsMinOrder(negotiation.product.id, Number(previewQty));

  const baseShippingSnapshot = await resolveBuyerShippingSnapshot(negotiation.buyerId);
  const mergedSnapshot = options?.shippingSnapshot
    ? mergeShippingSnapshot(baseShippingSnapshot, {
        ...options.shippingSnapshot,
        source: options.shippingSnapshot.source ?? 'custom',
      })
    : baseShippingSnapshot;

  if (options?.shippingSelection) {
    assertShippingDestinationReady(mergedSnapshot);
  }

  const { logisticsFee, logisticsMeta } = await resolveLogisticsForCheckout(
    options?.shippingSelection,
  );
  const financials = await calculateContractFinancials(previewSubtotal, logisticsFee);
  const buyerShippingSnapshot = logisticsMeta
    ? attachLogisticsToSnapshot(mergedSnapshot, logisticsMeta)
    : mergedSnapshot;

  const economics = await buildDealEconomics({
    catalogPricePerUnit: Number(negotiation.product.pricePerUnit),
    negotiatedPricePerUnit: Number(previewPrice),
    quantity: Number(previewQty),
    productStock: Number(negotiation.product.stock),
    unit: negotiation.product.unit,
  });

  const sellerShipping = await resolveSellerShippingOrigin(sellerId, {
    regency: negotiation.product.regency,
    province: negotiation.product.province,
  });

  return {
    negotiationId: negotiation.id,
    product: negotiation.product,
    buyer: negotiation.buyer,
    quantity: previewQty,
    pricePerUnit: previewPrice,
    specifications: negotiation.specifications,
    subtotal: financials.subtotal,
    platformFee: financials.platformFee,
    logisticsFee: financials.logisticsFee,
    vatAmount: financials.vatAmount,
    totalAmount: financials.totalAmount,
    buyerShippingSnapshot,
    sellerShipping,
    economics,
  };
};

/**
 * 1. Supplier creates definitive B2B Contract/Invoice
 */
export const createContract = async (
  sellerId: string,
  data: {
    negotiationId: string;
    shippingAddress?: string;
    shippingSnapshot?: Partial<ShippingAddressSnapshot>;
    shippingSelection?: ShippingSelectionInput;
    specifications?: string;
    quantity?: number;
    pricePerUnit?: number;
  },
) => {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: data.negotiationId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      productId: true,
      quantity: true,
      pricePerUnit: true,
      totalEstimate: true,
      specifications: true,
      status: true,
      isLocked: true,
      product: {
        select: {
          id: true,
          userId: true,
          name: true,
          technicalSpec: {
            select: {
              carbonPurity: true,
              phLevel: true,
              moistureContent: true,
            },
          },
        },
      },
      buyer: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
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

  const contractQty =
    data.quantity != null ? new Prisma.Decimal(data.quantity) : negotiation.quantity;
  const contractPrice =
    data.pricePerUnit != null ? new Prisma.Decimal(data.pricePerUnit) : negotiation.pricePerUnit;
  const contractSubtotal = contractQty.mul(contractPrice);

  await assertQuantityMeetsMinOrder(negotiation.productId, Number(contractQty));

  const baseShippingSnapshot = await resolveBuyerShippingSnapshot(
    negotiation.buyerId,
    data.shippingAddress,
  );
  const mergedSnapshot = data.shippingSnapshot
    ? mergeShippingSnapshot(baseShippingSnapshot, data.shippingSnapshot)
    : baseShippingSnapshot;

  assertShippingDestinationReady(mergedSnapshot);

  const negotiationProductLocation = await prisma.product.findUnique({
    where: { id: negotiation.productId },
    select: { regency: true, province: true },
  });
  const sellerOrigin = await resolveSellerShippingOrigin(
    sellerId,
    negotiationProductLocation ?? undefined,
  );
  assertContractIssueReady(mergedSnapshot, data.shippingSelection, sellerOrigin);

  const { logisticsFee, logisticsMeta } = await resolveLogisticsForCheckout(data.shippingSelection);
  const financials = await calculateContractFinancials(contractSubtotal, logisticsFee);
  const {
    subtotal,
    platformFee,
    logisticsFee: logisticsFeeFinal,
    vatAmount,
    totalAmount,
  } = financials;
  const shippingSnapshot = {
    ...attachLogisticsToSnapshot(mergedSnapshot, logisticsMeta),
    sellerOrigin: sellerOrigin.snapshot,
    ...(sellerOrigin.originLabel
      ? { sellerOriginLabel: sellerOrigin.originLabel }
      : {}),
  };

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

  const orderSpecifications =
    data.specifications?.trim() || negotiation.specifications || smartDescription.trim();

  // BISA-YYYYMMDD-XXXXXXXXXXXXXXXX
  // SEC-BE-021: entropy dinaikkan dari 24-bit (randomBytes(3) = 16M) ke 64-bit
  // (randomBytes(8) = 1.8e19) untuk mencegah enumeration orderNumber pada
  // endpoint publik /orders/verify/:orderNumber & /orders/track/:orderNumber.
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = crypto.randomBytes(8).toString('hex').toUpperCase();
  const orderNumber = `B2B-${dateStr}-${randomStr}`;
  const transactionExternalId = `TRX-${orderNumber}`;

  // Eksekusi Pembuatan DB dalam Prisma Transaction
  const result = await prisma.$transaction(async (tx) => {
    // 0. Validate & Decrement Stock (Prevent Overselling)
    const currentProduct = await tx.product.findUnique({
      where: { id: negotiation.productId },
      select: { stock: true },
    });
    if (!currentProduct || currentProduct.stock.lt(contractQty)) {
      throw new AppError('Stok produk tidak mencukupi untuk memenuhi jumlah pesanan.', 400);
    }
    await tx.product.update({
      where: { id: negotiation.productId },
      data: { stock: { decrement: contractQty } },
    });

    // 1. Lock Negotiation (sync final qty/price if supplier adjusted on invoice)
    await tx.negotiation.update({
      where: { id: negotiation.id },
      data: {
        quantity: contractQty,
        pricePerUnit: contractPrice,
        totalEstimate: contractSubtotal,
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
        checkoutBatchNumber: orderNumber,
        subtotal,
        platformFee,
        logisticsFee: logisticsFeeFinal,
        vatAmount,
        totalAmount,
        totalQuantity: contractQty,
        shippingAddressSnapshot: shippingSnapshot,
        status: OrderStatus.PENDING,
        isDigitalSigned: false,
        specifications: orderSpecifications,
        items: {
          create: {
            productId: negotiation.productId,
            quantity: contractQty,
            pricePerUnit: contractPrice,
            subtotal,
          },
        },
        shipment: {
          create: {
            batchId: buildBisaTrackingNumber(orderNumber),
            vesselName: logisticsMeta
              ? `${logisticsMeta.courierCode.toUpperCase()} · ${logisticsMeta.verifiedService ?? 'Menunggu resi'}`
              : 'Menunggu Pengiriman',
            courierCode: logisticsMeta?.courierCode.toLowerCase(),
          },
        },
      },
    });

    if (logisticsMeta) {
      await persistOrderShipping(order.id, logisticsMeta, tx);
    }

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

  scheduleSupplyDemandRefresh();

  return {
    orderId: result.order.id,
    orderNumber: result.order.orderNumber,
    totalAmount: result.order.totalAmount,
    negotiationStatus: NegotiationStatus.LOCKED,
    order: result.order,
    transaction: result.transaction,
  };
};

/**
 * Buyer-initiated direct checkout from cart, skipping the negotiation flow.
 *
 * Behavior:
 * - Input: cart-like `items` (productId + quantity) yang sudah dipilih buyer
 * - Group items by `sellerId` → 1 order per seller (skema Order = 1 buyer + 1 seller)
 * - Validate min order, decrement stock (transactional), buat Order + Items + Transaction
 * - Status awal `PENDING` (siap dibayar via `/orders/:id/pay`)
 * - Return list orders yang berhasil dibuat
 */
const computeGroupedSubtotals = (
  grouped: Map<string, Array<{ productId: string; quantity: number }>>,
  productMap: Map<string, { id: string; name: string; userId: string } & Record<string, unknown>>,
  orderType: 'STANDARD' | 'SAMPLE',
) => {
  const subtotals = new Map<string, Prisma.Decimal>();
  let grand = new Prisma.Decimal(0);
  for (const [sellerId, sellerItems] of grouped.entries()) {
    let sellerSubtotal = new Prisma.Decimal(0);
    for (const it of sellerItems) {
      const p = productMap.get(it.productId)!;
      const qty = new Prisma.Decimal(it.quantity);
      const unitPrice = resolveCheckoutUnitPrice(p as any, orderType);
      sellerSubtotal = sellerSubtotal.add(qty.mul(unitPrice));
    }
    subtotals.set(sellerId, sellerSubtotal);
    grand = grand.add(sellerSubtotal);
  }
  return { subtotals, grandSubtotal: grand };
};

export const createDirectOrderFromCart = async (
  buyerId: string,
  data: {
    items: Array<{ productId: string; quantity: number }>;
    shippingAddress?: string;
    shippingSnapshot?: Partial<ShippingAddressSnapshot>;
    shippingSelections?: Array<ShippingSelectionInput & { sellerId: string }>;
    notes?: string;
    orderType?: 'STANDARD' | 'SAMPLE';
    voucherCode?: string;
  },
) => {
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new AppError('Tidak ada produk yang dipilih untuk checkout.', 400);
  }

  const orderType = data.orderType ?? 'STANDARD';
  assertSampleCheckoutShape(data.items, orderType);

  await assertBuyerCommerceReady(buyerId);

  // Ambil product info termasuk seller untuk grouping
  const productIds = Array.from(new Set(data.items.map((it) => it.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: directCheckoutProductSelect,
  });

  if (products.length !== productIds.length) {
    throw new AppError('Beberapa produk tidak ditemukan atau sudah tidak tersedia.', 404);
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  for (const item of data.items) {
    const p = productMap.get(item.productId)!;
    assertDirectCheckoutItem(buyerId, item, p, orderType);
  }

  const baseShippingSnapshot = await resolveBuyerShippingSnapshot(buyerId, data.shippingAddress);
  const mergedShippingSnapshot = data.shippingSnapshot
    ? mergeShippingSnapshot(baseShippingSnapshot, data.shippingSnapshot)
    : baseShippingSnapshot;

  assertShippingDestinationReady(mergedShippingSnapshot);

  const logisticsBySeller = new Map<
    string,
    { logisticsFee: Prisma.Decimal; logisticsMeta?: LogisticsSnapshotMeta }
  >();
  if (data.shippingSelections?.length) {
    for (const sel of data.shippingSelections) {
      const resolved = await resolveLogisticsForCheckout(sel);
      logisticsBySeller.set(sel.sellerId, resolved);
    }
  }

  // Group items by sellerId
  const grouped = new Map<string, typeof data.items>();
  for (const item of data.items) {
    const p = productMap.get(item.productId)!;
    const arr = grouped.get(p.userId) ?? [];
    arr.push(item);
    grouped.set(p.userId, arr);
  }

  await assertDirectCheckoutShippingReady(
    [...grouped.keys()],
    mergedShippingSnapshot,
    data.shippingSelections,
  );

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const sellerIds = [...grouped.keys()];
  const sellerProfiles = await prisma.user.findMany({
    where: { id: { in: sellerIds } },
    select: {
      id: true,
      fullName: true,
      profile: { select: { companyName: true } },
    },
  });
  const sellerLabelById = new Map(
    sellerProfiles.map((u) => [
      u.id,
      (
        u.profile?.companyName?.trim() ||
        u.fullName?.trim() ||
        'Supplier'
      ).toString(),
    ]),
  );

  const isMultiSupplier = grouped.size > 1;
  const checkoutBatchId = isMultiSupplier ? crypto.randomUUID() : null;
  const batchRandom = crypto.randomBytes(8).toString('hex').toUpperCase();
  const sharedCheckoutBatchNumber = isMultiSupplier
    ? `${BISA_MULTI_CHECKOUT_ORDER_PREFIX}-${dateStr}-${batchRandom}`
    : null;

  const { subtotals: sellerSubtotals, grandSubtotal } = computeGroupedSubtotals(
    grouped,
    productMap,
    orderType,
  );
  const voucherCtx = data.voucherCode?.trim()
    ? await validateVoucherForCheckout({
        code: data.voucherCode,
        userId: buyerId,
        subtotal: grandSubtotal,
        sellerIds: [...grouped.keys()],
      })
    : null;

  const createdOrders: Array<{
    orderId: string;
    orderNumber: string;
    totalAmount: Prisma.Decimal;
    sellerId: string;
    sellerName: string;
  }> = [];

  // Eksekusi semua order dalam 1 transaction supaya all-or-nothing
  await prisma.$transaction(
    async (tx) => {
      for (const [sellerId, sellerItems] of grouped.entries()) {
        // Hitung subtotal per seller
        let subtotal = new Prisma.Decimal(0);
        let totalQty = new Prisma.Decimal(0);
        const itemRows: Array<{
          productId: string;
          quantity: Prisma.Decimal;
          pricePerUnit: Prisma.Decimal;
          subtotal: Prisma.Decimal;
        }> = [];

        for (const it of sellerItems) {
          const p = productMap.get(it.productId)!;
          const qty = new Prisma.Decimal(it.quantity);
          const unitPrice = resolveCheckoutUnitPrice(p, orderType);
          const lineSub = qty.mul(unitPrice);
          subtotal = subtotal.add(lineSub);
          totalQty = totalQty.add(qty);
          itemRows.push({
            productId: p.id,
            quantity: qty,
            pricePerUnit: unitPrice,
            subtotal: lineSub,
          });

          if (orderType !== 'SAMPLE') {
            await assertQuantityMeetsMinOrder(p.id, it.quantity);
          }
        }

        const sellerLogistics = logisticsBySeller.get(sellerId);
        const sellerDiscount = voucherCtx
          ? allocateVoucherDiscount(
              sellerSubtotals.get(sellerId) ?? subtotal,
              grandSubtotal,
              voucherCtx.discountAmount,
            )
          : new Prisma.Decimal(0);
        const adjustedSubtotal = subtotal.sub(sellerDiscount);
        const financials = await calculateContractFinancials(
          adjustedSubtotal,
          sellerLogistics?.logisticsFee ?? new Prisma.Decimal(0),
        );
        const shippingSnapshot = attachLogisticsToSnapshot(
          mergedShippingSnapshot,
          sellerLogistics?.logisticsMeta,
        );

        // Lock stock per produk
        for (const it of sellerItems) {
          const current = await tx.product.findUnique({
            where: { id: it.productId },
            select: { stock: true },
          });
          if (!current || current.stock.lt(it.quantity)) {
            throw new AppError(
              `Stok ${productMap.get(it.productId)!.name} sudah habis. Refresh keranjang.`,
              400,
            );
          }
          await tx.product.update({
            where: { id: it.productId },
            data: { stock: { decrement: it.quantity } },
          });
        }

        const randomStr = crypto.randomBytes(8).toString('hex').toUpperCase();
        const orderNumber = `ORD-${dateStr}-${randomStr}`;
        const transactionExternalId = `TRX-${orderNumber}`;

        const order = await tx.order.create({
          data: {
            buyerId,
            sellerId,
            orderNumber,
            checkoutBatchId,
            checkoutBatchNumber: sharedCheckoutBatchNumber ?? orderNumber,
            orderType,
            subtotal: financials.subtotal,
            platformFee: financials.platformFee,
            logisticsFee: financials.logisticsFee,
            vatAmount: financials.vatAmount,
            totalAmount: financials.totalAmount,
            totalQuantity: totalQty,
            voucherCode: voucherCtx?.code ?? null,
            voucherDiscount: sellerDiscount,
            shippingAddressSnapshot: shippingSnapshot,
            status: OrderStatus.PENDING,
            specifications:
              data.notes?.trim() ||
              (orderType === 'SAMPLE'
                ? 'Sample order — evaluasi kualitas sebelum PO penuh.'
                : 'Direct checkout dari cart.'),
            items: {
              create: itemRows,
            },
            shipment: {
              create: {
                batchId: buildBisaTrackingNumber(orderNumber),
                vesselName: sellerLogistics?.logisticsMeta
                  ? `${sellerLogistics.logisticsMeta.courierCode.toUpperCase()} · menunggu pembayaran`
                  : 'Menunggu pembayaran',
                courierCode: sellerLogistics?.logisticsMeta?.courierCode.toLowerCase(),
              },
            },
          },
        });

        if (sellerLogistics?.logisticsMeta) {
          await persistOrderShipping(order.id, sellerLogistics.logisticsMeta, tx);
        }

        await tx.transaction.create({
          data: {
            orderId: order.id,
            userId: buyerId,
            amount: financials.totalAmount,
            platformFee: financials.platformFee,
            sellerAmount: financials.subtotal,
            externalId: transactionExternalId,
            status: TransactionStatus.PENDING,
            paymentStatus: PaymentStatus.PENDING,
            type: TransactionType.SALES,
          },
        });

        // Item keranjang dihapus setelah semua order supplier selesai dibuat (lihat bawah loop).

        createdOrders.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          sellerId,
          sellerName: sellerLabelById.get(sellerId) ?? 'Supplier',
        });
      }

      await tx.cartItem.deleteMany({
        where: {
          userId: buyerId,
          productId: { in: productIds },
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15000,
    },
  );

  const batchTotalAmount = createdOrders.reduce(
    (sum, o) => sum.add(o.totalAmount),
    new Prisma.Decimal(0),
  );

  const checkoutBatchNumber =
    sharedCheckoutBatchNumber ?? createdOrders[0]?.orderNumber ?? null;

  if (voucherCtx && createdOrders[0]?.orderId) {
    await redeemVoucherForOrder({
      voucherId: voucherCtx.voucherId,
      userId: buyerId,
      orderId: createdOrders[0].orderId,
      discountAmount: voucherCtx.discountAmount,
    });
  }

  scheduleSupplyDemandRefresh();

  return {
    checkoutBatchId,
    checkoutBatchNumber,
    leadOrderId: createdOrders[0]?.orderId ?? null,
    batchTotalAmount,
    orders: createdOrders,
    totalOrders: createdOrders.length,
    voucherDiscount: voucherCtx ? Number(voucherCtx.discountAmount) : 0,
    voucherCode: voucherCtx?.code ?? null,
  };
};

export const previewDirectOrderFromCart = async (
  buyerId: string,
  data: {
    items: Array<{ productId: string; quantity: number }>;
    shippingAddress?: string;
    shippingSnapshot?: Partial<ShippingAddressSnapshot>;
    shippingSelections?: Array<ShippingSelectionInput & { sellerId: string }>;
    notes?: string;
    orderType?: 'STANDARD' | 'SAMPLE';
    voucherCode?: string;
  },
) => {
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new AppError('Tidak ada produk yang dipilih untuk checkout.', 400);
  }

  const orderType = data.orderType ?? 'STANDARD';
  assertSampleCheckoutShape(data.items, orderType);

  await assertBuyerCommerceReady(buyerId);

  const productIds = Array.from(new Set(data.items.map((it) => it.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: directCheckoutProductSelect,
  });

  if (products.length !== productIds.length) {
    throw new AppError('Beberapa produk tidak ditemukan atau sudah tidak tersedia.', 404);
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  for (const item of data.items) {
    const p = productMap.get(item.productId)!;
    assertDirectCheckoutItem(buyerId, item, p, orderType);
  }

  const baseShippingSnapshot = await resolveBuyerShippingSnapshot(buyerId, data.shippingAddress);
  const mergedShippingSnapshot = data.shippingSnapshot
    ? mergeShippingSnapshot(baseShippingSnapshot, data.shippingSnapshot)
    : baseShippingSnapshot;

  assertShippingDestinationReady(mergedShippingSnapshot);

  const logisticsBySeller = new Map<
    string,
    { logisticsFee: Prisma.Decimal; logisticsMeta?: LogisticsSnapshotMeta }
  >();
  if (data.shippingSelections?.length) {
    for (const sel of data.shippingSelections) {
      const resolved = await resolveLogisticsForCheckout(sel);
      logisticsBySeller.set(sel.sellerId, resolved);
    }
  }

  const grouped = new Map<string, typeof data.items>();
  for (const item of data.items) {
    const p = productMap.get(item.productId)!;
    const arr = grouped.get(p.userId) ?? [];
    arr.push(item);
    grouped.set(p.userId, arr);
  }

  await assertDirectCheckoutShippingReady(
    [...grouped.keys()],
    mergedShippingSnapshot,
    data.shippingSelections,
  );

  const orders: Array<{
    sellerId: string;
    totalQuantity: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    platformFee: Prisma.Decimal;
    vatAmount: Prisma.Decimal;
    logisticsFee: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    shippingAddressSnapshot: ShippingAddressSnapshot;
  }> = [];
  let subtotal = new Prisma.Decimal(0);
  let platformFee = new Prisma.Decimal(0);
  let vatAmount = new Prisma.Decimal(0);
  let logisticsFee = new Prisma.Decimal(0);
  let totalAmount = new Prisma.Decimal(0);
  let voucherDiscount = new Prisma.Decimal(0);

  const { subtotals: sellerSubtotals, grandSubtotal } = computeGroupedSubtotals(
    grouped,
    productMap,
    orderType,
  );
  const voucherCtx = data.voucherCode?.trim()
    ? await validateVoucherForCheckout({
        code: data.voucherCode,
        userId: buyerId,
        subtotal: grandSubtotal,
        sellerIds: [...grouped.keys()],
      })
    : null;
  if (voucherCtx) voucherDiscount = voucherCtx.discountAmount;

  for (const [sellerId, sellerItems] of grouped.entries()) {
    let sellerSubtotal = new Prisma.Decimal(0);
    let totalQty = new Prisma.Decimal(0);
    for (const it of sellerItems) {
      const p = productMap.get(it.productId)!;
      const qty = new Prisma.Decimal(it.quantity);
      const unitPrice = resolveCheckoutUnitPrice(p, orderType);
      const lineSub = qty.mul(unitPrice);
      sellerSubtotal = sellerSubtotal.add(lineSub);
      totalQty = totalQty.add(qty);
      if (orderType !== 'SAMPLE') {
        await assertQuantityMeetsMinOrder(p.id, it.quantity);
      }
    }
    const sellerLogistics = logisticsBySeller.get(sellerId);
    const sellerDiscount = voucherCtx
      ? allocateVoucherDiscount(
          sellerSubtotals.get(sellerId) ?? sellerSubtotal,
          grandSubtotal,
          voucherCtx.discountAmount,
        )
      : new Prisma.Decimal(0);
    const adjustedSubtotal = sellerSubtotal.sub(sellerDiscount);
    const financials = await calculateContractFinancials(
      adjustedSubtotal,
      sellerLogistics?.logisticsFee ?? new Prisma.Decimal(0),
    );
    subtotal = subtotal.add(financials.subtotal);
    platformFee = platformFee.add(financials.platformFee);
    vatAmount = vatAmount.add(financials.vatAmount);
    logisticsFee = logisticsFee.add(financials.logisticsFee);
    totalAmount = totalAmount.add(financials.totalAmount);

    orders.push({
      sellerId,
      totalQuantity: totalQty,
      subtotal: financials.subtotal,
      voucherDiscount: sellerDiscount,
      platformFee: financials.platformFee,
      vatAmount: financials.vatAmount,
      logisticsFee: financials.logisticsFee,
      totalAmount: financials.totalAmount,
      shippingAddressSnapshot: attachLogisticsToSnapshot(
        mergedShippingSnapshot,
        sellerLogistics?.logisticsMeta,
      ),
    });
  }

  return {
    subtotal,
    platformFee,
    vatAmount,
    logisticsFee,
    totalAmount,
    voucherDiscount,
    voucherCode: voucherCtx?.code ?? null,
    totalOrders: orders.length,
    orders,
  };
};

export const previewDirectOrderFromCurrentCart = async (
  buyerId: string,
  data: {
    shippingAddress?: string;
    shippingSnapshot?: Partial<ShippingAddressSnapshot>;
    shippingSelections?: Array<ShippingSelectionInput & { sellerId: string }>;
    notes?: string;
  },
) => {
  const cartItems = await prisma.cartItem.findMany({
    where: { userId: buyerId },
    select: {
      productId: true,
      quantity: true,
    },
  });

  if (cartItems.length === 0) {
    throw new AppError('Keranjang masih kosong. Tambahkan produk dulu.', 400);
  }

  return previewDirectOrderFromCart(buyerId, {
    items: cartItems.map((it) => ({
      productId: it.productId,
      quantity: Number(it.quantity),
    })),
    shippingAddress: data.shippingAddress,
    shippingSnapshot: data.shippingSnapshot,
    shippingSelections: data.shippingSelections,
    notes: data.notes,
  });
};

/**
 * Supplier may revise shipping address & notes on a pending invoice (typo / correction).
 */
export const updatePendingInvoice = async (
  sellerId: string,
  orderId: string,
  data: {
    shippingSnapshot?: Partial<ShippingAddressSnapshot>;
    specifications?: string;
  },
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      sellerId: true,
      status: true,
      shippingAddressSnapshot: true,
      specifications: true,
      negotiation: { select: { id: true } },
      transaction: { select: { paymentStatus: true, status: true } },
    },
  });

  if (!order) throw new AppError('Pesanan tidak ditemukan.', 404);
  if (order.sellerId !== sellerId) throw new AppError('Anda tidak memiliki akses.', 403);
  if (order.status !== OrderStatus.PENDING) {
    throw new AppError('Tagihan hanya bisa diedit sebelum pembayaran.', 400);
  }
  if (order.transaction && order.transaction.paymentStatus !== PaymentStatus.PENDING) {
    throw new AppError('Tagihan tidak bisa diedit karena pembayaran sudah diproses.', 400);
  }

  const currentSnapshot = (order.shippingAddressSnapshot ?? {}) as ShippingAddressSnapshot;
  const shippingSnapshot = data.shippingSnapshot
    ? mergeShippingSnapshot(currentSnapshot, data.shippingSnapshot)
    : currentSnapshot;

  assertShippingDestinationReady(shippingSnapshot);

  const specifications =
    data.specifications !== undefined ? data.specifications.trim() || null : order.specifications;

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        shippingAddressSnapshot: shippingSnapshot,
        specifications,
      },
    });

    const negotiationId = order.negotiation?.id;
    if (negotiationId) {
      await tx.negotiation.update({
        where: { id: negotiationId },
        data: { specifications },
      });
      await tx.chatMessage.create({
        data: {
          negotiationId,
          senderId: sellerId,
          content: 'Detail tagihan diperbarui (alamat/catatan).',
          isSystemMessage: true,
        },
      });
    }

    return updated;
  });

  const negotiationId = order.negotiation?.id;
  if (negotiationId) {
    const { default: pusher } = await import('#config/pusher');
    pusher.trigger(`private-negotiation-${negotiationId}`, 'status-updated', {
      status: NegotiationStatus.LOCKED,
      orderId,
    });
  }

  return updatedOrder;
};

const paymentChannelSelect = {
  id: true,
  code: true,
  name: true,
  isActive: true,
  group: true,
  minAmount: true,
  maxAmount: true,
  currency: true,
} as const;

type SelectedPaymentChannel = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  group: PaymentMethod | null;
  minAmount: Prisma.Decimal | null;
  maxAmount: Prisma.Decimal | null;
  currency: string | null;
};

/**
 * Bangun ulang response pembayaran dari `providerActions` yang sudah tersimpan,
 * supaya mobile bisa menampilkan instruksi VA/QR tanpa memanggil Xendit lagi.
 */
export const buildPendingPaymentFromTransaction = (params: {
  providerActions: unknown;
  paymentChannel?: { code: string; name: string } | null;
  amount: Prisma.Decimal | number;
  paymentRequestId?: string | null;
  xenditInvoiceId?: string | null;
  paymentUrl?: string | null;
}): Record<string, unknown> | null => {
  const providerActions = resolveProviderActions(params.providerActions);
  const amount = Number(params.amount.toString());
  const roundedAmount = roundIdrAmount(amount);
  const channelCode = params.paymentChannel?.code;

  if (params.xenditInvoiceId && params.paymentUrl) {
    return {
      mode: 'WEB',
      invoiceUrl: params.paymentUrl,
      amount: roundedAmount,
      channelCode,
      channelName: params.paymentChannel?.name,
      expiryDate: extractPaymentExpiryDate(providerActions),
    };
  }

  if (!params.paymentRequestId || !providerActions) return null;

  const extracted = extractXenditDirectPaymentData(providerActions, channelCode);
  if (!extracted) return null;

  return {
    mode: 'DIRECT',
    paymentRequestId: params.paymentRequestId,
    paymentType: extracted.paymentType,
    channelCode: extracted.channelCode || channelCode,
    channelName: params.paymentChannel?.name,
    paymentData: extracted.paymentData,
    amount: roundedAmount,
    expiryDate: extractPaymentExpiryDate(providerActions),
    ...(isMockProviderActions(providerActions) ? { isMockPayment: true } : {}),
  };
};

const persistMockPaymentInit = async (params: {
  transactionId: string;
  channel: SelectedPaymentChannel;
  order: {
    id: string;
    orderNumber: string;
    buyer?: { fullName?: string | null } | null;
  };
  amount: number;
  externalId: string;
}) => {
  const methodGroup = params.channel.group || PaymentMethod.BANK_TRANSFER;
  const { providerActions, response } = buildMockPaymentInitResult({
    orderId: params.order.id,
    orderNumber: params.order.orderNumber,
    externalId: params.externalId,
    amount: params.amount,
    channelCode: params.channel.code,
    channelName: params.channel.name,
    methodGroup,
    customerName: params.order.buyer?.fullName,
  });

  await prisma.transaction.update({
    where: { id: params.transactionId },
    data: {
      paymentRequestId: providerActions.id as string,
      paymentChannelId: params.channel.id,
      paymentMethod: methodGroup,
      providerActions: sealProviderActions(providerActions),
    },
  });

  console.warn(
    '[XENDIT MOCK] Pembayaran diinisialisasi tanpa API Xendit (development). ' +
      'Gunakan POST /api/v1/orders/:id/mock-confirm-payment untuk simulasi lunas.',
  );

  return response;
};

/** Batalkan Payment Request di Xendit (best-effort, abaikan jika sudah expired). */
const tryCancelXenditPaymentRequest = async (params: {
  paymentRequestId?: string | null;
  providerActions?: unknown;
}): Promise<void> => {
  const { paymentRequestId, providerActions } = params;
  if (!paymentRequestId || paymentRequestId.startsWith('mock-')) return;
  if (isMockProviderActions(providerActions)) return;

  const key = resolveXenditPaymentSecretKey();
  if (!key) return;

  try {
    await cancelPaymentRequestV3(paymentRequestId, key);
    console.log(`[XENDIT] Payment request ${paymentRequestId} dibatalkan.`);
  } catch (err) {
    console.warn(
      `[XENDIT] Cancel payment request ${paymentRequestId} gagal (mungkin sudah expired):`,
      err instanceof Error ? err.message : err,
    );
  }
};

/** Validasi & urutkan pesanan dari satu checkout batch (lead = pertama dibuat). */
const resolveBatchCheckoutOrders = async (buyerId: string, orderIds: string[]) => {
  const uniqueIds = Array.from(new Set(orderIds));
  if (uniqueIds.length === 0) {
    throw new AppError('Minimal 1 pesanan untuk pembayaran gabungan.', 400);
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: uniqueIds }, buyerId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      orderNumber: true,
      checkoutBatchNumber: true,
      buyerId: true,
      status: true,
      totalAmount: true,
      checkoutBatchId: true,
      transaction: {
        select: {
          id: true,
          externalId: true,
          amount: true,
          paymentRequestId: true,
          xenditInvoiceId: true,
        },
      },
    },
  });

  if (orders.length !== uniqueIds.length) {
    throw new AppError('Beberapa pesanan tidak ditemukan atau bukan milik Anda.', 404);
  }

  const batchIds = new Set(
    orders.map((o) => o.checkoutBatchId).filter((id): id is string => Boolean(id)),
  );
  if (batchIds.size !== 1) {
    throw new AppError(
      batchIds.size === 0
        ? 'Pesanan tunggal tidak memakai pembayaran gabungan. Gunakan bayar per pesanan (/orders/:id/pay).'
        : 'Semua pesanan harus dari satu sesi checkout yang sama (multi-supplier).',
      400,
    );
  }

  const checkoutBatchId = [...batchIds][0]!;
  const allInBatch = await prisma.order.count({ where: { checkoutBatchId, buyerId } });
  if (allInBatch !== orders.length) {
    throw new AppError(
      'Pembayaran gabungan harus mencakup semua pesanan dari checkout ini.',
      400,
    );
  }

  for (const order of orders) {
    if (order.status !== OrderStatus.PENDING) {
      throw new AppError(`Pesanan ${order.orderNumber} sudah diproses atau dibayar.`, 400);
    }
    if (!order.transaction) {
      throw new AppError(`Transaksi pesanan ${order.orderNumber} tidak ditemukan.`, 500);
    }
  }

  return { checkoutBatchId, orders, leadOrder: orders[0]! };
};

/**
 * Satu pembayaran untuk semua pesanan direct checkout (1–N supplier).
 * Lead transaction externalId → TRX-BISA-MCHK-{checkoutBatchId}, amount = total gabungan.
 */
export const initializeBatchPayment = async (
  buyerId: string,
  orderIds: string[],
  channelCode?: string,
  forceNew = false,
) => {
  const uniqueIds = Array.from(new Set(orderIds));
  if (uniqueIds.length === 1) {
    const lone = await prisma.order.findFirst({
      where: { id: uniqueIds[0]!, buyerId },
      select: {
        id: true,
        orderNumber: true,
        checkoutBatchId: true,
        checkoutBatchNumber: true,
      },
    });
    if (!lone) {
      throw new AppError('Pesanan tidak ditemukan atau bukan milik Anda.', 404);
    }
    // Direct checkout 1 supplier: tidak punya checkoutBatchId → bayar per pesanan.
    if (!lone.checkoutBatchId) {
      const payment = await initializePayment(lone.id, buyerId, channelCode, forceNew);
      return {
        ...payment,
        checkoutBatchId: null,
        checkoutBatchNumber: lone.checkoutBatchNumber ?? lone.orderNumber,
        leadOrderId: lone.id,
        orderIds: [lone.id],
        orderNumbers: [lone.orderNumber],
        batchTotalAmount: payment.amount,
        isBatchPayment: false,
      };
    }
  }

  const { checkoutBatchId, orders, leadOrder } = await resolveBatchCheckoutOrders(
    buyerId,
    orderIds,
  );

  const batchTotal = orders.reduce(
    (sum, o) => sum.add(o.totalAmount),
    new Prisma.Decimal(0),
  );
  const batchTotalRounded = roundIdrDecimal(batchTotal);
  const batchExternalId = `${BATCH_PAYMENT_EXTERNAL_PREFIX}${checkoutBatchId}`;

  await prisma.$transaction(async (tx) => {
    const lockedLead = await tx.order.findUnique({
      where: { id: leadOrder.id },
      select: {
        id: true,
        status: true,
        transaction: { select: { id: true, status: true } },
      },
    });

    if (!lockedLead?.transaction) {
      throw new AppError('Transaksi pembayaran batch tidak ditemukan.', 404);
    }
    if (lockedLead.status !== OrderStatus.PENDING) {
      throw new AppError('Semua pesanan batch harus masih menunggu pembayaran.', 400);
    }

    const pendingCount = await tx.order.count({
      where: {
        checkoutBatchId,
        buyerId,
        status: OrderStatus.PENDING,
      },
    });
    if (pendingCount !== orders.length) {
      throw new AppError('Status pesanan batch berubah. Muat ulang checkout.', 409);
    }

    await tx.transaction.update({
      where: {
        id: lockedLead.transaction.id,
        status: TransactionStatus.PENDING,
      },
      data: {
        externalId: batchExternalId,
        amount: batchTotalRounded,
      },
    });
  });

  const payment = await initializePayment(leadOrder.id, buyerId, channelCode, forceNew);

  const checkoutBatchNumber =
    orders[0]?.checkoutBatchNumber ??
    (orders.length === 1 ? orders[0]?.orderNumber : null);

  return {
    ...payment,
    checkoutBatchId,
    checkoutBatchNumber,
    leadOrderId: leadOrder.id,
    orderIds: orders.map((o) => o.id),
    orderNumbers: checkoutBatchNumber
      ? [checkoutBatchNumber]
      : orders.map((o) => o.orderNumber),
    batchTotalAmount: roundIdrAmount(batchTotalRounded),
    isBatchPayment: orders.length > 1,
  };
};

/** Simulasi lunas untuk pembayaran gabungan (dev/test). */
export const simulateBatchPayment = async (buyerId: string, orderIds: string[]) => {
  const { checkoutBatchId, orders, leadOrder } = await resolveBatchCheckoutOrders(
    buyerId,
    orderIds,
  );
  const result = await simulateOrderPayment(leadOrder.id, buyerId);

  // Pastikan semua sibling ikut PROCESSING (jika webhook batch terlewat).
  if (checkoutBatchId) {
    await prisma.$transaction(async (tx) => {
      const siblings = await tx.order.findMany({
        where: {
          checkoutBatchId,
          buyerId,
          id: { not: leadOrder.id },
          status: OrderStatus.PENDING,
        },
        select: { id: true, transaction: { select: { id: true } } },
      });
      const paidAt = new Date();
      for (const sibling of siblings) {
        if (sibling.transaction) {
          await tx.transaction.update({
            where: { id: sibling.transaction.id },
            data: {
              paymentStatus: PaymentStatus.SUCCESS,
              status: TransactionStatus.ESCROW_HELD,
              paidAt,
            },
          });
        }
        await tx.order.update({
          where: { id: sibling.id },
          data: { status: OrderStatus.PROCESSING },
        });
        await tx.shipmentTracking.updateMany({
          where: { orderId: sibling.id },
          data: { vesselName: 'Menunggu pengiriman' },
        });
      }
    });
  }

  const checkoutBatchNumber =
    orders[0]?.checkoutBatchNumber ??
    (orders.length === 1 ? orders[0]?.orderNumber : null);
  return {
    ...((typeof result === 'object' && result !== null ? result : {}) as Record<string, unknown>),
    orderIds: orders.map((o) => o.id),
    checkoutBatchNumber,
    orderNumbers: checkoutBatchNumber
      ? [checkoutBatchNumber]
      : orders.map((o) => o.orderNumber),
    batchSize: orders.length,
  };
};

/**
 * 1b. Buyer Initializes Payment (Dual-Mode: Invoice for Redirect / PaymentRequest for Direct Data)
 * Deteksi otomatis: channelCode ada â†’ PaymentRequest V3 (Direct), tidak ada â†’ Invoice (Redirect)
 */
export const initializePayment = async (
  orderId: string,
  buyerId: string,
  channelCode?: string,
  forceNew = false,
) => {
  // 1. Validasi Order (Dinamis: Include Buyer untuk Metadata)
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      buyerId: true,
      checkoutBatchId: true,
      totalAmount: true,
      specifications: true,
      status: true,
      transaction: {
        select: {
          id: true,
          externalId: true,
          amount: true,
          paymentRequestId: true,
          xenditInvoiceId: true,
          providerActions: true,
        },
      },
      buyer: { select: { fullName: true, email: true } },
      items: {
        select: {
          quantity: true,
          pricePerUnit: true,
          productId: true,
          product: {
            select: {
              name: true,
              biomassaType: true,
              minOrder: true,
              unit: true,
            },
          },
        },
      },
    },
  });

  if (!order) throw new AppError('Pesanan tidak ditemukan.', 404);
  if (order.buyerId !== buyerId) throw new AppError('Anda bukan pembeli pesanan ini.', 403);
  if (order.status !== OrderStatus.PENDING)
    throw new AppError('Pesanan ini sudah diproses atau dibayar.', 400);
  if (!order.transaction) throw new AppError('Data transaksi tidak ditemukan.', 500);

  if (order.checkoutBatchId) {
    const batchCount = await prisma.order.count({
      where: { checkoutBatchId: order.checkoutBatchId, buyerId },
    });
    if (batchCount > 1) {
      const lead = await prisma.order.findFirst({
        where: { checkoutBatchId: order.checkoutBatchId, buyerId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (lead && lead.id !== orderId) {
        throw new AppError(
          'Checkout multi-supplier: bayar sekali untuk semua pesanan lewat pembayaran gabungan.',
          400,
        );
      }
    }
  }

  for (const item of order.items) {
    const minOrder = Number(item.product.minOrder);
    const qty = Number(item.quantity);
    if (qty < minOrder) {
      throw new AppError(
        `Minimal order ${minOrder} ${item.product.unit} untuk ${item.product.name}.`,
        400,
      );
    }
  }

  // Ganti metode: reset inisialisasi lama lalu buat Payment Request / Invoice baru.
  if (forceNew && (order.transaction.paymentRequestId || order.transaction.xenditInvoiceId)) {
    await tryCancelXenditPaymentRequest({
      paymentRequestId: order.transaction.paymentRequestId,
      providerActions: order.transaction.providerActions,
    });
    await prisma.transaction.update({
      where: { id: order.transaction.id },
      data: {
        paymentRequestId: null,
        xenditInvoiceId: null,
        paymentUrl: null,
        providerActions: Prisma.DbNull,
        paymentChannelId: null,
      },
    });
    order.transaction.paymentRequestId = null;
    order.transaction.xenditInvoiceId = null;
  }

  // Sudah pernah inisialisasi → kembalikan data yang sama (bukan 409),
  // agar user bisa buka ulang instruksi VA/QR dari detail pesanan.
  if (!forceNew && (order.transaction.paymentRequestId || order.transaction.xenditInvoiceId)) {
    const existing = await prisma.transaction.findUnique({
      where: { id: order.transaction.id },
      select: {
        amount: true,
        paymentRequestId: true,
        xenditInvoiceId: true,
        paymentUrl: true,
        providerActions: true,
        paymentChannel: { select: { code: true, name: true } },
      },
    });

    const tryReturnExisting = (providerActions: unknown) => {
      const rebuilt = existing
        ? buildPendingPaymentFromTransaction({
            providerActions,
            paymentChannel: existing.paymentChannel,
            amount: existing.amount,
            paymentRequestId: existing.paymentRequestId,
            xenditInvoiceId: existing.xenditInvoiceId,
            paymentUrl: existing.paymentUrl,
          })
        : null;
      if (
        rebuilt?.paymentData &&
        typeof rebuilt.paymentData === 'object' &&
        paymentDataHasPayableDetail(rebuilt.paymentData as Record<string, unknown>)
      ) {
        return rebuilt;
      }
      return null;
    };

    let cached = tryReturnExisting(existing?.providerActions);
    if (cached) return cached;

    const paymentRequestId = existing?.paymentRequestId;
    if (paymentRequestId && !paymentRequestId.startsWith('mock-')) {
      const pollKey = resolveXenditPaymentSecretKey();
      if (pollKey) {
        const pollClient = new Xendit({ secretKey: pollKey });
        for (let attempt = 0; attempt < 6; attempt++) {
          if (attempt > 0) await sleep(1500);
          const pr = await pollClient.PaymentRequest.getPaymentRequestByID({
            paymentRequestId,
          });
          await prisma.transaction.update({
            where: { id: order.transaction.id },
            data: { providerActions: sealProviderActions(pr) },
          });
          cached = tryReturnExisting(pr);
          if (cached) return cached;
        }
      }
    }

    throw new AppError(
      'VA/QR belum tersedia. Tap "Lanjut ke Pembayaran" lagi untuk generate ulang.',
      502,
    );
  }

  const isBatchLeadPayment = isMultiCheckoutPaymentExternalId(
    order.transaction.externalId ?? '',
  );
  const amountDecimal = roundIdrDecimal(
    isBatchLeadPayment ? order.transaction.amount : order.totalAmount,
  );
  const amount = roundIdrAmount(amountDecimal);

  // Order lama / batch: fee/PPN persen bisa menghasilkan desimal — Xendit IDR wajib bulat.
  if (
    !isBatchLeadPayment &&
    !amountDecimal.equals(order.totalAmount)
  ) {
    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { totalAmount: amountDecimal },
      }),
      prisma.transaction.update({
        where: { id: order.transaction!.id },
        data: { amount: amountDecimal },
      }),
    ]);
  } else if (isBatchLeadPayment && !amountDecimal.equals(order.transaction.amount)) {
    await prisma.transaction.update({
      where: { id: order.transaction.id },
      data: { amount: amountDecimal },
    });
  }

  const description = isBatchLeadPayment
    ? `Pembayaran gabungan checkout ${order.checkoutBatchId?.slice(0, 8) ?? ''}`
    : (order.specifications as string) || `Pembayaran Order ${order.orderNumber}`;
  const externalId = order.transaction!.externalId || `TRX-${order.orderNumber}`;

  // 2. Cari Channel dan Grupnya di Database (Admin & Dynamic mapping)
  let channel: SelectedPaymentChannel | null = null;
  if (channelCode) {
    channel = await prisma.paymentChannel.findFirst({
      where: { code: channelCode.toUpperCase() },
      select: paymentChannelSelect,
    });
    if (!channel) throw new AppError(`Metode pembayaran "${channelCode}" tidak ditemukan.`, 404);
    if (!channel.isActive)
      throw new AppError(
        `Metode pembayaran "${channel.name}" sedang tidak tersedia. Silakan pilih metode lain.`,
        503,
      );

    void saveUserPaymentPreference(buyerId, {
      code: channel.code,
      name: channel.name,
      group: channel.group ?? 'BANK_TRANSFER',
    });

    const payAmount = new Prisma.Decimal(amount);
    if (channel.minAmount && payAmount.lt(channel.minAmount)) {
      throw new AppError(
        `Minimal pembayaran ${Number(channel.minAmount)} ${channel.currency || 'IDR'}.`,
        400,
      );
    }
    if (channel.maxAmount && payAmount.gt(channel.maxAmount)) {
      throw new AppError(
        `Maksimal pembayaran ${Number(channel.maxAmount)} ${channel.currency || 'IDR'}.`,
        400,
      );
    }
  }

  if (isXenditMockPaymentEnabled() && !isXenditWebhookDevMode()) {
    const mockChannel =
      channel ??
      (await prisma.paymentChannel.findFirst({
        where: { isActive: true },
        select: paymentChannelSelect,
      }));
    if (!mockChannel) {
      throw new AppError('Tidak ada metode pembayaran aktif untuk mode mock.', 503);
    }
    return persistMockPaymentInit({
      transactionId: order.transaction!.id,
      channel: mockChannel,
      order,
      amount,
      externalId,
    });
  }

  // Resolver mengambil XENDIT_PAYMENT_SECRET_KEY dengan fallback ke
  // XENDIT_SECRET_KEY (legacy) supaya konfigurasi single-key tetap jalan.
  const xenditKey = resolveXenditPaymentSecretKey();
  if (!xenditKey) {
    throw new AppError(
      'Konfigurasi pembayaran belum lengkap: set XENDIT_PAYMENT_SECRET_KEY ' +
        '(atau XENDIT_SECRET_KEY sebagai fallback) di file .env backend.',
      503,
    );
  }

  const xenditClient = new Xendit({
    secretKey: xenditKey,
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MODE DIRECT (channelCode) â†’ Payment Request V3 (Zero Hardcode)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

    let paymentRequest:
      | Awaited<ReturnType<Xendit['PaymentRequest']['createPaymentRequest']>>
      | undefined;
    try {
      paymentRequest = await withRetry(() =>
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
    } catch (err) {
      if (shouldFallbackXenditDirectToInvoice(err)) {
        console.warn(
          `[XENDIT] Payment Request ditolak (403) untuk ${upperCode}. ` +
            `Fallback ke Invoice (Hosted Checkout). Aktifkan permission Payment Requests + ` +
            `Payment Methods (Write) di API key TEST untuk VA/QR langsung.`,
        );
      } else {
        throw translateXenditError(err, `membuat permintaan pembayaran ${upperCode}`);
      }
    }

    if (paymentRequest) {
      let latestPaymentRequest = paymentRequest;

      for (let attempt = 0; attempt < 6; attempt++) {
        const extractedAttempt = extractXenditDirectPaymentData(latestPaymentRequest, upperCode);
        if (extractedAttempt && paymentDataHasPayableDetail(extractedAttempt.paymentData)) {
          await prisma.transaction.update({
            where: { id: order.transaction.id },
            data: {
              paymentRequestId: latestPaymentRequest.id,
              paymentChannelId: channel.id,
              paymentMethod: channel.group ?? undefined,
              providerActions: sealProviderActions(latestPaymentRequest),
            },
          });

          return {
            mode: 'DIRECT',
            paymentRequestId: latestPaymentRequest.id,
            paymentType: extractedAttempt.paymentType,
            channelCode: extractedAttempt.channelCode || upperCode,
            channelName: channel.name,
            paymentData: extractedAttempt.paymentData,
            amount,
          };
        }

        if (attempt < 5) {
          await sleep(1500);
          latestPaymentRequest = await xenditClient.PaymentRequest.getPaymentRequestByID({
            paymentRequestId: paymentRequest.id,
          });
        }
      }

      await prisma.transaction.update({
        where: { id: order.transaction.id },
        data: {
          paymentRequestId: paymentRequest.id,
          paymentChannelId: channel.id,
          paymentMethod: channel.group ?? undefined,
          providerActions: sealProviderActions(latestPaymentRequest),
        },
      });

      const extracted = extractXenditDirectPaymentData(latestPaymentRequest, upperCode);
      if (!extracted) {
        throw new AppError(
          'Xendit mengembalikan Payment Request tanpa detail metode pembayaran. Coba lagi atau pilih channel lain.',
          502,
        );
      }

      if (!paymentDataHasPayableDetail(extracted.paymentData)) {
        throw new AppError(
          'Nomor VA/QR belum tersedia dari Xendit. Tunggu beberapa detik lalu coba "Lanjut ke Pembayaran" lagi.',
          502,
        );
      }

      return {
        mode: 'DIRECT',
        paymentRequestId: paymentRequest.id,
        paymentType: extracted.paymentType,
        channelCode: extracted.channelCode || upperCode,
        channelName: channel.name,
        paymentData: extracted.paymentData,
        amount,
        expiryDate: extractPaymentExpiryDate(latestPaymentRequest),
      };
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MODE WEB (tanpa channelCode) â†’ Invoice (Hosted Checkout)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const invoiceRuntimeConfig = await getInvoiceRuntimeConfig();
  let invoice;
  try {
    invoice = await withRetry(() =>
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
            price: roundIdrAmount(item.pricePerUnit),
            category: item.product?.biomassaType || invoiceRuntimeConfig.defaultInvoiceCategory,
          })),
          successRedirectUrl: `${process.env.CORS_ORIGINS?.split(',')[0] || 'http://localhost:3000'}/payment/success`,
          failureRedirectUrl: `${process.env.CORS_ORIGINS?.split(',')[0] || 'http://localhost:3000'}/payment/failed`,
        },
      }),
    );
  } catch (err) {
    if (shouldUseXenditMockOnForbidden(err)) {
      const mockChannel =
        channel ??
        (await prisma.paymentChannel.findFirst({
          where: { isActive: true },
          select: paymentChannelSelect,
        }));
      if (mockChannel) {
        console.warn(
          '[XENDIT MOCK] Invoice ditolak (403) — menggunakan pembayaran simulasi (development).',
        );
        return persistMockPaymentInit({
          transactionId: order.transaction!.id,
          channel: mockChannel,
          order,
          amount,
          externalId,
        });
      }
    }
    throw translateXenditError(err, 'membuat invoice pembayaran (Hosted Checkout)');
  }

  // Simpan ke database
  const invoicePayload = invoice as Record<string, any>;
  await prisma.transaction.update({
    where: { id: order.transaction.id },
    data: {
      xenditInvoiceId: invoicePayload.id,
      paymentUrl: invoicePayload.invoice_url || invoicePayload.invoiceUrl,
      providerActions: sealProviderActions(invoice),
    },
  });

  const usedInvoiceFallback = Boolean(channelCode && channel);

  return {
    mode: 'WEB',
    invoiceId: invoicePayload.id,
    invoiceUrl: invoicePayload.invoice_url || invoicePayload.invoiceUrl,
    channelCode: channel?.code,
    channelName: channel?.name,
    amount,
    expiryDate: invoicePayload.expiry_date || invoicePayload.expiryDate,
    ...(usedInvoiceFallback && {
      fallbackFromDirect: true,
      fallbackMessage:
        'VA/QR langsung tidak tersedia pada API key saat ini. Membuka halaman pembayaran Xendit.',
    }),
  };
};

/**
 * [DEV / TEST] Simulasi pembayaran lunas.
 * - Mock payment → langsung update DB
 * - Payment Request Xendit test → POST /v3/.../simulate + poll status + apply webhook logic
 */
export const simulateOrderPayment = async (orderId: string, buyerId: string) => {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('Simulasi pembayaran hanya tersedia di non-production.', 404);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      status: true,
      transaction: {
        select: {
          id: true,
          userId: true,
          orderId: true,
          amount: true,
          type: true,
          status: true,
          externalId: true,
          paymentRequestId: true,
          providerActions: true,
        },
      },
      items: { select: { productId: true } },
    },
  });

  if (!order) throw new AppError('Pesanan tidak ditemukan.', 404);
  if (order.buyerId !== buyerId) throw new AppError('Akses ditolak.', 403);
  if (!order.transaction) throw new AppError('Transaksi tidak ditemukan.', 500);
  if (order.status !== OrderStatus.PENDING) {
    throw new AppError('Pesanan sudah diproses.', 400);
  }

  if (isMockProviderActions(order.transaction.providerActions)) {
    return mockConfirmPayment(orderId, buyerId);
  }

  const paymentRequestId = order.transaction.paymentRequestId;
  if (!paymentRequestId) {
    throw new AppError(
      'Simulasi Xendit hanya untuk Payment Request (VA/QRIS). Pesanan ini memakai Invoice hosted checkout.',
      400,
    );
  }

  const key = resolveXenditPaymentSecretKey();
  if (!key) {
    throw new AppError('Konfigurasi XENDIT_PAYMENT_SECRET_KEY belum lengkap.', 503);
  }

  const amount = roundIdrAmount(order.transaction.amount.toString());
  await simulatePaymentRequestV3(paymentRequestId, amount, key);

  const xenditClient = new Xendit({ secretKey: key });

  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) await sleep(1500);

    const pr = await xenditClient.PaymentRequest.getPaymentRequestByID({
      paymentRequestId,
    });

    if (pr.status === 'SUCCEEDED') {
      const referenceId = pr.referenceId || order.transaction.externalId;
      if (!referenceId) {
        throw new AppError('Payment Request tanpa reference_id — tidak bisa apply webhook.', 502);
      }

      await applyPaymentSucceededWebhook(referenceId, amount);

      return prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, orderNumber: true, status: true },
      });
    }

    if (pr.status === 'FAILED' || pr.status === 'CANCELED' || pr.status === 'EXPIRED') {
      throw new AppError(`Simulasi gagal — status payment request: ${pr.status}`, 502);
    }
  }

  return {
    orderId,
    simulated: true,
    pendingWebhook: true,
    message:
      'Simulasi Xendit sedang diproses. Status pesanan akan terupdate via webhook Payment Requests v3.',
  };
};

/**
 * Batalkan inisialisasi pembayaran (cancel PR di Xendit + reset transaksi lokal).
 */
export const cancelOrderPayment = async (orderId: string, buyerId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      status: true,
      transaction: {
        select: {
          id: true,
          paymentRequestId: true,
          xenditInvoiceId: true,
          providerActions: true,
        },
      },
    },
  });

  if (!order) throw new AppError('Pesanan tidak ditemukan.', 404);
  if (order.buyerId !== buyerId) throw new AppError('Akses ditolak.', 403);
  if (order.status !== OrderStatus.PENDING) {
    throw new AppError('Hanya pesanan menunggu pembayaran yang bisa dibatalkan.', 400);
  }
  if (!order.transaction) throw new AppError('Transaksi tidak ditemukan.', 500);

  const hadPayment =
    Boolean(order.transaction.paymentRequestId) || Boolean(order.transaction.xenditInvoiceId);

  if (hadPayment) {
    await tryCancelXenditPaymentRequest({
      paymentRequestId: order.transaction.paymentRequestId,
      providerActions: order.transaction.providerActions,
    });

    await prisma.transaction.update({
      where: { id: order.transaction.id },
      data: {
        paymentRequestId: null,
        xenditInvoiceId: null,
        paymentUrl: null,
        providerActions: Prisma.DbNull,
        paymentChannelId: null,
        paymentStatus: PaymentStatus.PENDING,
        status: TransactionStatus.PENDING,
      },
    });
  }

  return { orderId, canceled: hadPayment };
};

/**
 * [DEV ONLY] Konfirmasi lunas mock — apply lewat handler webhook Payment Request V3.
 * Dengan `XENDIT_WEBHOOK_DEV=true`, mengirim HTTP POST ke `/payments/session-webhook`.
 */
export const mockConfirmPayment = async (orderId: string, buyerId: string) => {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('Endpoint tidak tersedia di production.', 404);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      buyerId: true,
      status: true,
      transaction: {
        select: {
          id: true,
          userId: true,
          orderId: true,
          amount: true,
          type: true,
          status: true,
          externalId: true,
          providerActions: true,
        },
      },
      items: { select: { productId: true } },
    },
  });

  if (!order) throw new AppError('Pesanan tidak ditemukan.', 404);
  if (order.buyerId !== buyerId) throw new AppError('Akses ditolak.', 403);
  if (!order.transaction) throw new AppError('Transaksi tidak ditemukan.', 500);
  if (!isMockProviderActions(order.transaction.providerActions)) {
    throw new AppError(
      'Pesanan ini bukan pembayaran mock. Gunakan webhook Xendit atau perbaiki API key.',
      400,
    );
  }
  if (order.status !== OrderStatus.PENDING) {
    throw new AppError('Pesanan sudah diproses.', 400);
  }

  const externalId = order.transaction.externalId || `TRX-${order.orderNumber}`;
  const amount = roundIdrAmount(order.transaction.amount);

  await applyPaymentSucceededWebhook(externalId, amount);

  return prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, status: true },
  });
};

/**
 * 2. List Purchasing / Sales Log with Pagination
 */

const buildOrderListSearchFilter = (search?: string): Prisma.OrderWhereInput => {
  const q = search?.trim();
  if (!q) return {};

  return {
    OR: [
      { orderNumber: { contains: q } },
      { checkoutBatchNumber: { contains: q } },
      { items: { some: { product: { name: { contains: q } } } } },
      { seller: { fullName: { contains: q } } },
      { buyer: { fullName: { contains: q } } },
      { seller: { profile: { companyName: { contains: q } } } },
      { shipment: { batchId: { contains: q } } },
      { shipment: { awbNumber: { contains: q } } },
    ],
  };
};

const buildOrderListBaseWhere = (params: {
  userId: string;
  role: 'BUYER' | 'SELLER';
  search?: string;
  productMode?: string;
  orderTypeFilter?: 'STANDARD' | 'SAMPLE';
}): Prisma.OrderWhereInput => {
  const { userId, role, search, productMode, orderTypeFilter } = params;
  return {
    ...(role === UserRole.BUYER ? { buyerId: userId } : { sellerId: userId }),
    ...(search?.trim() && buildOrderListSearchFilter(search)),
    ...(productMode && {
      items: {
        some: {
          product: {
            productMode: productMode as any,
          },
        },
      },
    }),
    ...(orderTypeFilter && { orderType: orderTypeFilter }),
  };
};

export const getOrderStatusCounts = async (params: {
  userId: string;
  role: 'BUYER' | 'SELLER';
  search?: string;
  productMode?: string;
  orderTypeFilter?: 'STANDARD' | 'SAMPLE';
}) => {
  const baseWhere = buildOrderListBaseWhere(params);

  const [statusGroups, refundedCount, total] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { id: true },
    }),
    prisma.order.count({
      where: {
        ...baseWhere,
        transaction: { status: TransactionStatus.REFUNDED },
      },
    }),
    prisma.order.count({ where: baseWhere }),
  ]);

  const byStatus = new Map(
    statusGroups.map((row) => [row.status, row._count.id ?? 0]),
  );

  const processing =
    (byStatus.get(OrderStatus.PROCESSING) ?? 0) +
    (byStatus.get(OrderStatus.CONFIRMED) ?? 0);

  return {
    ALL: total,
    PENDING: byStatus.get(OrderStatus.PENDING) ?? 0,
    PROCESSING: processing,
    SHIPPED: byStatus.get(OrderStatus.SHIPPED) ?? 0,
    COMPLETED: byStatus.get(OrderStatus.COMPLETED) ?? 0,
    CANCELLED: byStatus.get(OrderStatus.CANCELLED) ?? 0,
    DISPUTED: byStatus.get(OrderStatus.DISPUTED) ?? 0,
    REFUNDED: refundedCount,
  };
};

export const listOrdersByRole = async (params: {
  userId: string;
  role: 'BUYER' | 'SELLER';
  statusFilter?: string;
  search?: string;
  productMode?: string;
  orderTypeFilter?: 'STANDARD' | 'SAMPLE';
  page?: number;
  limit?: number;
}) => {
  const { userId, role, statusFilter, search, productMode, orderTypeFilter, page = 1, limit = 20 } =
    params;
  const skip = (page - 1) * limit;

  const where: Prisma.OrderWhereInput = {
    ...buildOrderListBaseWhere({ userId, role, search, productMode, orderTypeFilter }),
    ...(statusFilter &&
      Object.values(OrderStatus).includes(statusFilter as OrderStatus) && {
        status: statusFilter as OrderStatus,
      }),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        checkoutBatchId: true,
        checkoutBatchNumber: true,
        buyerId: true,
        sellerId: true,
        status: true,
        orderType: true,
        subtotal: true,
        platformFee: true,
        logisticsFee: true,
        vatAmount: true,
        totalAmount: true,
        totalQuantity: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            pricePerUnit: true,
            subtotal: true,
            product: {
              select: {
                name: true,
                biomassaType: true,
                thumbnailUrl: true,
                images: {
                  select: {
                    url: true,
                  },
                  take: 1,
                },
              },
            },
          },
        },
        buyer: { select: { fullName: true, avatarUrl: true } },
        seller: { select: { fullName: true, avatarUrl: true } },
        transaction: {
          select: {
            status: true,
            paymentStatus: true,
            paymentUrl: true,
            paidAt: true,
            paymentMethod: true,
          },
        },
        shipment: {
          select: {
            batchId: true,
            vesselName: true,
            originHub: true,
            destinationHub: true,
            awbNumber: true,
            courierCode: true,
            deliveryStatus: true,
            lastTrackedAt: true,
            currentLat: true,
            currentLng: true,
            updatedAt: true,
          },
        },
      },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    data: orders.map((order) => {
      const enriched = attachOrderMediaUrls(order);
      return {
        ...enriched,
        paymentStatus: order.transaction?.paymentStatus ?? null,
      };
    }),
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
    awbNumber?: string;
    courierCode?: string;
    recipientPhoneLast5?: string;
  },
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      buyerId: true,
      sellerId: true,
      status: true,
      shipment: {
        select: {
          orderId: true,
        },
      },
    },
  });

  if (!order || !order.shipment)
    throw new AppError('Data pengiriman pesanan tidak ditemukan.', 404);
  if (order.sellerId !== sellerId)
    throw new AppError('Hanya Penyuplai yang bisa update resi.', 403);
  if (order.status === OrderStatus.PENDING)
    throw new AppError('Pesanan belum dilunasi Buyer.', 400);

  const notifyShipped = order.status === OrderStatus.PROCESSING;

  // Wrap status + tracking update in a single transaction
  const shipment = await prisma.$transaction(async (tx) => {
    if (notifyShipped) {
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.SHIPPED } });
    }

    const existingBatchId = (
      await tx.shipmentTracking.findUnique({
        where: { orderId },
        select: { batchId: true },
      })
    )?.batchId;

    return tx.shipmentTracking.update({
      where: { orderId },
      data: {
        batchId: existingBatchId?.trim() || buildBisaTrackingNumber(order.orderNumber),
        vesselName: data.vesselName,
        originHub: data.originHub,
        destinationHub: data.destinationHub,
        currentLat: data.latitude ? new Prisma.Decimal(data.latitude) : undefined,
        currentLng: data.longitude ? new Prisma.Decimal(data.longitude) : undefined,
        awbNumber: data.awbNumber?.trim() || undefined,
        courierCode: data.courierCode?.trim().toLowerCase() || undefined,
        recipientPhoneLast5: data.recipientPhoneLast5?.trim() || undefined,
      },
    });
  });

  if (notifyShipped) {
    void notifyOrderStatusChange({
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'SHIPPED',
    });
  }

  return shipment;
};

/**
 * 4. Get Detail Order
 */
export const getOrderDetail = async (id: string, userId: string) => {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      checkoutBatchId: true,
      checkoutBatchNumber: true,
      buyerId: true,
      sellerId: true,
      status: true,
      subtotal: true,
      platformFee: true,
      logisticsFee: true,
      vatAmount: true,
      totalAmount: true,
      totalQuantity: true,
      shippingAddressId: true,
      shippingAddressSnapshot: true,
      specifications: true,
      isDigitalSigned: true,
      buyerSignedAt: true,
      sellerSignedAt: true,
      createdAt: true,
      updatedAt: true,
      shippingAddress: {
        select: {
          fullAddress: true,
          zipCode: true,
          phoneNumber: true,
          province: { select: { name: true } },
          regency: { select: { name: true } },
        },
      },
      buyer: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          regency: true,
          verification: {
            select: {
              isVerified: true,
            },
          },
        },
      },
      seller: {
        select: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          regency: true,
          verification: {
            select: {
              isVerified: true,
            },
          },
        },
      },
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          pricePerUnit: true,
          subtotal: true,
          product: {
            select: {
              id: true,
              name: true,
              biomassaType: true,
              unit: true,
              thumbnailUrl: true,
              images: {
                select: {
                  url: true,
                },
                take: 1,
              },
            },
          },
        },
      },
      transaction: {
        select: {
          id: true,
          amount: true,
          sellerAmount: true,
          platformFee: true,
          type: true,
          status: true,
          paymentStatus: true,
          paymentUrl: true,
          paymentRequestId: true,
          xenditInvoiceId: true,
          providerActions: true,
          externalId: true,
          paidAt: true,
          escrowReleasedAt: true,
          createdAt: true,
          paymentChannel: {
            select: { code: true, name: true, group: true },
          },
        },
      },
      orderShipping: true,
      shipment: {
        select: {
          orderId: true,
          batchId: true,
          vesselName: true,
          originHub: true,
          destinationHub: true,
          awbNumber: true,
          courierCode: true,
          deliveryStatus: true,
          lastTrackedAt: true,
          currentLat: true,
          currentLng: true,
          updatedAt: true,
        },
      },
      negotiation: {
        select: {
          id: true,
          messages: {
            select: {
              id: true,
              senderId: true,
              content: true,
              attachmentUrl: true,
              isSystemMessage: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
      review: {
        select: {
          id: true,
          rating: true,
          comment: true,
        },
      },
      dispute: {
        select: {
          id: true,
          reason: true,
          description: true,
          evidenceUrls: true,
          sellerResponse: true,
          sellerEvidenceUrls: true,
          sellerRespondedAt: true,
          status: true,
          resolution: true,
          resolutionNote: true,
          resolvedAt: true,
          mediationStartedAt: true,
          readyToResolveAt: true,
          mediationStartedById: true,
          createdAt: true,
        },
      },
    },
  });

  if (!order) throw new AppError('Pesanan tidak ditemukan', 404);
  if (order.buyerId !== userId && order.sellerId !== userId)
    throw new AppError('Akses Ditolak', 403);

  let shippingAddressSnapshot = order.shippingAddressSnapshot as Record<string, unknown> | null;

  if (!shippingAddressSnapshot && order.shippingAddress) {
    shippingAddressSnapshot = {
      recipient: order.buyer.fullName,
      phone: order.shippingAddress.phoneNumber ?? order.buyer.phone,
      email: order.buyer.email,
      address: order.shippingAddress.fullAddress,
      zipCode: order.shippingAddress.zipCode,
      province: order.shippingAddress.province?.name,
      regency: order.shippingAddress.regency?.name ?? order.buyer.regency,
    };
  }

  const {
    shippingAddress: _shippingAddress,
    shippingAddressId: _shippingAddressId,
    ...orderData
  } = order;

  // Ekstraksi QR Kontrak Dummy
  const digitalQRData = `${order.orderNumber}:VERIFIED:${order.createdAt.getTime()}`;

  const pendingPayment =
    orderData.transaction &&
    orderData.transaction.paymentStatus === PaymentStatus.PENDING &&
    (orderData.transaction.paymentRequestId || orderData.transaction.xenditInvoiceId)
      ? buildPendingPaymentFromTransaction({
          providerActions: orderData.transaction.providerActions,
          paymentChannel: orderData.transaction.paymentChannel,
          amount: orderData.transaction.amount,
          paymentRequestId: orderData.transaction.paymentRequestId,
          xenditInvoiceId: orderData.transaction.xenditInvoiceId,
          paymentUrl: orderData.transaction.paymentUrl,
        })
      : null;

  const disputePayload =
    formatDisputeResponse(orderData.dispute) ??
    (orderData.status === OrderStatus.DISPUTED
      ? parseDisputeFromChatMessages(orderData.negotiation?.messages ?? [])
      : null);

  let negotiationId = orderData.negotiation?.id ?? null;
  if (orderData.status === OrderStatus.DISPUTED && orderData.dispute && !negotiationId) {
    const room = await ensureDisputeNegotiationRoom(id);
    negotiationId = room.id;
  }

  const { dispute: _dispute, negotiation: _negotiation, ...restOrderData } = orderData;

  return attachOrderMediaUrls({
    ...restOrderData,
    negotiationId,
    shippingAddressSnapshot,
    digitalContractQrData: digitalQRData,
    pendingPayment,
    dispute: disputePayload,
  });
};

const checkoutBatchOrderListSelect = {
  id: true,
  orderNumber: true,
  checkoutBatchId: true,
  checkoutBatchNumber: true,
  buyerId: true,
  sellerId: true,
  status: true,
  subtotal: true,
  platformFee: true,
  logisticsFee: true,
  vatAmount: true,
  totalAmount: true,
  totalQuantity: true,
  shippingAddressSnapshot: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      quantity: true,
      pricePerUnit: true,
      subtotal: true,
      product: {
        select: {
          name: true,
          biomassaType: true,
          thumbnailUrl: true,
          unit: true,
          images: {
            select: { url: true },
            take: 1,
          },
        },
      },
    },
  },
  buyer: { select: { id: true, fullName: true, avatarUrl: true, regency: true } },
  seller: { select: { id: true, fullName: true, avatarUrl: true, regency: true } },
  transaction: {
    select: {
      status: true,
      paymentStatus: true,
      paymentUrl: true,
      paidAt: true,
      paymentMethod: true,
    },
  },
  shipment: {
    select: {
      batchId: true,
      vesselName: true,
      originHub: true,
      destinationHub: true,
      awbNumber: true,
      courierCode: true,
      deliveryStatus: true,
      lastTrackedAt: true,
      currentLat: true,
      currentLng: true,
      updatedAt: true,
    },
  },
} as const;

/**
 * Detail checkout multi-supplier: semua pesanan dalam satu batch + status per supplier.
 */
export const getCheckoutBatchDetail = async (orderId: string, userId: string) => {
  const anchor = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      checkoutBatchId: true,
      checkoutBatchNumber: true,
      shippingAddressSnapshot: true,
      createdAt: true,
    },
  });

  if (!anchor) throw new AppError('Pesanan tidak ditemukan', 404);
  if (anchor.buyerId !== userId && anchor.sellerId !== userId) {
    throw new AppError('Akses Ditolak', 403);
  }
  if (!anchor.checkoutBatchId) {
    throw new AppError('Pesanan ini bukan checkout multi-supplier.', 400);
  }

  const isBuyer = anchor.buyerId === userId;
  const orders = await prisma.order.findMany({
    where: {
      checkoutBatchId: anchor.checkoutBatchId,
      ...(isBuyer ? { buyerId: userId } : { sellerId: userId }),
    },
    orderBy: { createdAt: 'asc' },
    select: checkoutBatchOrderListSelect,
  });

  if (orders.length === 0) {
    throw new AppError('Pesanan batch tidak ditemukan.', 404);
  }

  const enrichedOrders = orders.map((o) => attachOrderMediaUrls(o));
  const batchTotalAmount = enrichedOrders.reduce(
    (sum, o) => sum.add(o.totalAmount),
    new Prisma.Decimal(0),
  );

  const batchNumber =
    anchor.checkoutBatchNumber?.trim() ||
    enrichedOrders[0]?.checkoutBatchNumber?.trim() ||
    null;

  return {
    checkoutBatchId: anchor.checkoutBatchId,
    checkoutBatchNumber: batchNumber,
    shippingAddressSnapshot: anchor.shippingAddressSnapshot ?? orders[0]?.shippingAddressSnapshot,
    createdAt: anchor.createdAt,
    batchTotalAmount: roundIdrAmount(batchTotalAmount),
    supplierCount: enrichedOrders.length,
    orders: enrichedOrders,
  };
};

const resolveEvidenceUrls = (urls: unknown): string[] => {
  if (!Array.isArray(urls)) return [];
  return urls
    .map((raw) => {
      if (typeof raw !== 'string' || !raw.trim()) return null;
      return raw.startsWith('http') ? raw : storageService.getPublicUrl(raw);
    })
    .filter((url): url is string => Boolean(url));
};

const formatDisputeResponse = (
  dispute:
    | {
        id: string;
        reason: string;
        description: string | null;
        evidenceUrls: unknown;
        sellerResponse: string | null;
        sellerEvidenceUrls: unknown;
        sellerRespondedAt: Date | null;
        status: DisputeStatus;
        resolution: string | null;
        resolutionNote: string | null;
        resolvedAt: Date | null;
        mediationStartedAt: Date | null;
        readyToResolveAt: Date | null;
        mediationStartedById: string | null;
        createdAt: Date;
      }
    | null
    | undefined,
) => {
  if (!dispute) return null;
  return {
    id: dispute.id,
    reason: dispute.reason,
    description: dispute.description,
    evidenceUrls: resolveEvidenceUrls(dispute.evidenceUrls),
    sellerResponse: dispute.sellerResponse,
    sellerEvidenceUrls: resolveEvidenceUrls(dispute.sellerEvidenceUrls),
    sellerRespondedAt: dispute.sellerRespondedAt,
    status: dispute.status,
    resolution: dispute.resolution,
    resolutionNote: dispute.resolutionNote,
    resolvedAt: dispute.resolvedAt,
    mediationStartedAt: dispute.mediationStartedAt,
    readyToResolveAt: dispute.readyToResolveAt,
    mediationStartedById: dispute.mediationStartedById,
    createdAt: dispute.createdAt,
  };
};

const parseDisputeFromChatMessages = (
  messages: Array<{
    content: string;
    attachmentUrl?: string | null;
    isSystemMessage?: boolean;
    createdAt: Date;
  }>,
) => {
  const disputeMessage = messages.find(
    (m) => m.isSystemMessage && m.content.startsWith('SENGKETA DIAJUKAN:'),
  );
  if (!disputeMessage) return null;

  const reason = disputeMessage.content.replace('SENGKETA DIAJUKAN:', '').trim();
  const [mainReason, ...detailParts] = reason.split('\n\nDetail:');
  const evidenceUrls = messages
    .filter((m) => m.isSystemMessage && m.content.includes('Bukti sengketa') && m.attachmentUrl)
    .map((m) => storageService.getPublicUrl(m.attachmentUrl!));

  return {
    id: 'legacy',
    reason: mainReason.trim(),
    description: detailParts.join('\n\nDetail:').trim() || null,
    evidenceUrls,
    sellerResponse: null,
    sellerEvidenceUrls: [],
    sellerRespondedAt: null,
    status: DisputeStatus.OPEN,
    resolution: null,
    resolutionNote: null,
    resolvedAt: null,
    createdAt: disputeMessage.createdAt,
  };
};

/**
 * 5. Raise Dispute (Buyer Mengajukan Komplain)
 */
export const raiseDispute = async (
  orderId: string,
  buyerId: string,
  reason: string,
  description?: string,
  evidenceUrls?: string[],
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      orderNumber: true,
      status: true,
      totalAmount: true,
      dispute: { select: { id: true } },
      items: {
        take: 1,
        select: {
          productId: true,
          quantity: true,
          pricePerUnit: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  if (!order) throw new AppError('Pesanan tidak ditemukan.', 404);
  if (order.buyerId !== buyerId)
    throw new AppError('Hanya pembeli yang bisa mengajukan sengketa.', 403);
  if (order.dispute) {
    throw new AppError('Sengketa untuk pesanan ini sudah diajukan.', 409);
  }

  const allowedStatuses: string[] = [OrderStatus.SHIPPED, OrderStatus.PROCESSING];
  if (!allowedStatuses.includes(order.status)) {
    throw new AppError(
      'Sengketa hanya bisa diajukan untuk pesanan yang sedang diproses atau dikirim.',
      400,
    );
  }

  const firstItem = order.items[0];
  if (!firstItem) {
    throw new AppError('Pesanan tidak memiliki item produk.', 400);
  }

  try {
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const statusUpdate = await tx.order.updateMany({
        where: {
          id: orderId,
          buyerId,
          status: { in: [OrderStatus.SHIPPED, OrderStatus.PROCESSING] },
          dispute: { is: null },
        },
        data: { status: OrderStatus.DISPUTED },
      });

      if (statusUpdate.count === 0) {
        const current = await tx.order.findUnique({
          where: { id: orderId },
          select: { dispute: { select: { id: true } }, status: true },
        });
        if (current?.dispute) {
          throw new AppError('Sengketa untuk pesanan ini sudah diajukan.', 409);
        }
        throw new AppError(
          'Sengketa hanya bisa diajukan untuk pesanan yang sedang diproses atau dikirim.',
          400,
        );
      }

      await tx.orderDispute.create({
        data: {
          orderId,
          raisedById: buyerId,
          reason: reason.trim(),
          description: description?.trim() || null,
          evidenceUrls: evidenceUrls ?? [],
          status: DisputeStatus.OPEN,
        },
      });

      let negotiation = await tx.negotiation.findFirst({ where: { orderId } });

      if (!negotiation) {
        negotiation = await ensureDisputeNegotiationRoom(orderId, tx);
      }

      const detail = description?.trim() ? `\n\nDetail: ${description.trim()}` : '';
      await tx.chatMessage.create({
        data: {
          negotiationId: negotiation.id,
          senderId: buyerId,
          content: `SENGKETA DIAJUKAN: ${reason}${detail}`,
          isSystemMessage: true,
        },
      });

      if (evidenceUrls?.length) {
        await tx.chatMessage.createMany({
          data: evidenceUrls.map((url, index) => ({
            negotiationId: negotiation.id,
            senderId: buyerId,
            content: `Bukti sengketa #${index + 1}`,
            attachmentUrl: url,
            isSystemMessage: true,
          })),
        });
      }

      const updatedOrder = await tx.order.findUnique({ where: { id: orderId } });
      return { updatedOrder: updatedOrder!, negotiationId: negotiation.id };
    });

    void createNotification({
      userId: order.sellerId,
      title: 'Sengketa Pesanan',
      body: `Pembeli mengajukan sengketa pada pesanan ${order.orderNumber}.`,
      type: NotificationType.DISPUTE,
      priority: NotificationPriority.HIGH,
      refId: orderId,
    }).catch(() => {});

    return {
      ...updatedOrder.updatedOrder,
      negotiationId: updatedOrder.negotiationId,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new AppError('Sengketa untuk pesanan ini sudah diajukan.', 409);
    }
    throw error;
  }
};

/**
 * 5b. Supplier Response to Dispute
 */
export const respondToDispute = async (
  orderId: string,
  sellerId: string,
  response: string,
  evidenceUrls?: string[],
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      orderNumber: true,
      status: true,
      dispute: { select: { id: true, sellerRespondedAt: true, status: true } },
    },
  });

  if (!order) throw new AppError('Pesanan tidak ditemukan.', 404);
  if (order.sellerId !== sellerId)
    throw new AppError('Hanya supplier yang bisa memberi tanggapan sengketa.', 403);
  if (order.status !== OrderStatus.DISPUTED)
    throw new AppError('Pesanan tidak dalam status sengketa.', 400);
  if (!order.dispute) throw new AppError('Data sengketa tidak ditemukan.', 404);
  if (order.dispute.sellerRespondedAt)
    throw new AppError('Tanggapan supplier sudah dikirim sebelumnya.', 400);
  if (order.dispute.status === DisputeStatus.RESOLVED)
    throw new AppError('Sengketa sudah diselesaikan.', 400);

  const updatedDispute = await prisma.$transaction(async (tx) => {
    const dispute = await tx.orderDispute.update({
      where: { orderId },
      data: {
        sellerResponse: response.trim(),
        sellerEvidenceUrls: evidenceUrls ?? [],
        sellerRespondedAt: new Date(),
        status: DisputeStatus.UNDER_REVIEW,
      },
    });

    const negotiation = await ensureDisputeNegotiationRoom(orderId, tx);

    await tx.chatMessage.create({
      data: {
        negotiationId: negotiation.id,
        senderId: sellerId,
        content: `TANGGAPAN SUPPLIER: ${response.trim()}`,
        isSystemMessage: true,
      },
    });

    if (evidenceUrls?.length) {
      await tx.chatMessage.createMany({
        data: evidenceUrls.map((url, index) => ({
          negotiationId: negotiation.id,
          senderId: sellerId,
          content: `Bukti tanggapan supplier #${index + 1}`,
          attachmentUrl: url,
          isSystemMessage: true,
        })),
      });
    }

    return dispute;
  });

  void createNotification({
    userId: order.buyerId,
    title: 'Tanggapan Sengketa',
    body: `Supplier memberi tanggapan untuk sengketa pesanan ${order.orderNumber}.`,
    type: NotificationType.DISPUTE,
    priority: NotificationPriority.HIGH,
    refId: orderId,
  }).catch(() => {});

  return updatedDispute;
};

/**
 * 6. Public Contract Verification (Untuk QR Scan Logistik)
 * Tidak memerlukan Auth, hanya mengembalikan data publik terbatas.
 */
export const signContract = async (orderId: string, userId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      buyerSignedAt: true,
      sellerSignedAt: true,
      isDigitalSigned: true,
    },
  });
  if (!order) throw new AppError('Pesanan tidak ditemukan.', 404);

  const isBuyer = order.buyerId === userId;
  const isSeller = order.sellerId === userId;
  if (!isBuyer && !isSeller) throw new AppError('Anda tidak berhak menandatangani kontrak ini.', 403);

  const now = new Date();
  const signHash = crypto
    .createHash('sha256')
    .update(`${userId}:${orderId}:${now.toISOString()}`)
    .digest('hex');

  const data: Prisma.OrderUpdateInput = {};
  if (isBuyer && !order.buyerSignedAt) {
    data.buyerSignedAt = now;
    data.buyerSignHash = signHash;
  } else if (isSeller && !order.sellerSignedAt) {
    data.sellerSignedAt = now;
    data.sellerSignHash = signHash;
  } else {
    throw new AppError('Kontrak sudah Anda tandatangani.', 400);
  }

  const buyerWillSign = isBuyer ? now : order.buyerSignedAt;
  const sellerWillSign = isSeller ? now : order.sellerSignedAt;
  if (buyerWillSign && sellerWillSign) {
    data.isDigitalSigned = true;
  }

  return prisma.order.update({
    where: { id: orderId },
    data,
    select: {
      id: true,
      orderNumber: true,
      isDigitalSigned: true,
      buyerSignedAt: true,
      sellerSignedAt: true,
    },
  });
};

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
      isDigitalSigned: true,
      buyerSignedAt: true,
      sellerSignedAt: true,
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
    verificationStatus: order.isDigitalSigned
      ? 'SIGNED_AND_VERIFIED'
      : 'ISSUED_PENDING_SIGNATURE',
    timestamp: new Date(),
  };
};

/**
 * 7. Public Shipment Tracking (Live Monitoring)
 * Provides real-time logistics data without authentication.
 */
export const trackOrder = async (orderNumber: string) => {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      orderNumber: true,
      status: true,
      totalQuantity: true,
      items: {
        select: {
          product: { select: { name: true, biomassaType: true, unit: true } },
          quantity: true,
        },
      },
      seller: { select: { fullName: true } },
      shipment: {
        select: {
          batchId: true,
          awbNumber: true,
          courierCode: true,
          deliveryStatus: true,
          vesselName: true,
          shipmentType: true,
          originHub: true,
          destinationHub: true,
          currentLat: true,
          currentLng: true,
          estimatedSpeed: true,
          aiInsight: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!order) {
    throw new AppError('Pesanan tidak ditemukan', 404);
  }

  return order;
};

/**
 * 8. Get Sales Analytics for Supplier
 */
const toNumber = (value: unknown) => {
  if (value == null) return 0;
  return Number(value);
};

const pctChange = (current: number, previous: number) => {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const buildDailySales = (orders: Array<{ createdAt: Date; totalAmount: unknown }>, days = 7) => {
  const today = startOfDay(new Date());
  const buckets: Array<{ date: string; label: string; amount: number; orders: number }> = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    buckets.push({
      date: key,
      label: day.toLocaleDateString('id-ID', { weekday: 'short' }),
      amount: 0,
      orders: 0,
    });
  }

  const bucketMap = new Map(buckets.map((b) => [b.date, b]));
  for (const order of orders) {
    const key = startOfDay(order.createdAt).toISOString().slice(0, 10);
    const bucket = bucketMap.get(key);
    if (!bucket) continue;
    bucket.amount += toNumber(order.totalAmount);
    bucket.orders += 1;
  }

  return buckets;
};

type SalesRecommendation = {
  id: string;
  type: 'warning' | 'info' | 'success' | 'action';
  title: string;
  message: string;
  actionLabel?: string;
  actionRoute?: string;
};

const buildSalesRecommendations = (input: {
  pendingOrders: number;
  activeNegotiations: number;
  revenueGrowth: number;
  thisMonthOrders: number;
  cancellationRate: number;
  lowStockProducts: Array<{ name: string }>;
  highInterestLowSales: Array<{ name: string; likeCount: number; cartCount: number }>;
  topInCart: Array<{ name: string; cartCount: number; totalSold: number }>;
}): SalesRecommendation[] => {
  const recommendations: SalesRecommendation[] = [];

  if (input.pendingOrders > 0) {
    recommendations.push({
      id: 'pending-orders',
      type: 'action',
      title: 'Pesanan Perlu Ditindaklanjuti',
      message: `${input.pendingOrders} pesanan menunggu konfirmasi atau pengiriman. Respon cepat meningkatkan kepercayaan pembeli.`,
      actionLabel: 'Lihat Pesanan',
      actionRoute: '/orders',
    });
  }

  if (input.activeNegotiations > 0) {
    recommendations.push({
      id: 'active-negotiations',
      type: 'action',
      title: 'Negosiasi Aktif',
      message: `${input.activeNegotiations} negosiasi masih berjalan. Follow-up chat dapat meningkatkan closing rate.`,
      actionLabel: 'Buka Chat',
      actionRoute: '/negotiations',
    });
  }

  if (input.thisMonthOrders === 0) {
    recommendations.push({
      id: 'no-sales-month',
      type: 'warning',
      title: 'Belum Ada Penjualan Bulan Ini',
      message:
        'Optimalkan foto produk, harga kompetitif, dan respons chat agar listing lebih menarik.',
      actionLabel: 'Kelola Produk',
      actionRoute: '/product-management',
    });
  } else if (input.revenueGrowth >= 15) {
    recommendations.push({
      id: 'revenue-up',
      type: 'success',
      title: 'Momentum Penjualan Positif',
      message: `Pendapatan naik ${input.revenueGrowth}% dibanding bulan lalu. Pertahankan stok produk terlaris.`,
    });
  } else if (input.revenueGrowth <= -10) {
    recommendations.push({
      id: 'revenue-down',
      type: 'warning',
      title: 'Penjualan Menurun',
      message: `Pendapatan turun ${Math.abs(input.revenueGrowth)}% vs bulan lalu. Evaluasi harga, promo, dan respons negosiasi.`,
      actionLabel: 'Minat Produk',
      actionRoute: '/product-engagement',
    });
  }

  if (input.cancellationRate >= 10) {
    recommendations.push({
      id: 'high-cancellation',
      type: 'warning',
      title: 'Tingkat Pembatalan Tinggi',
      message: `${input.cancellationRate}% pesanan dibatalkan. Periksa ketersediaan stok dan kecepatan respons.`,
    });
  }

  for (const product of input.lowStockProducts.slice(0, 2)) {
    recommendations.push({
      id: `low-stock-${product.name}`,
      type: 'warning',
      title: 'Stok Menipis',
      message: `Stok "${product.name}" hampir habis. Restock agar pesanan tidak terlewat.`,
      actionLabel: 'Kelola Produk',
      actionRoute: '/product-management',
    });
  }

  for (const product of input.highInterestLowSales.slice(0, 2)) {
    recommendations.push({
      id: `interest-${product.name}`,
      type: 'info',
      title: 'Produk Diminati, Belum Laku',
      message: `"${product.name}" mendapat ${product.likeCount} suka & ${product.cartCount} keranjang. Pertimbangkan diskon atau follow-up pembeli.`,
      actionLabel: 'Lihat Minat',
      actionRoute: '/product-engagement',
    });
  }

  for (const product of input.topInCart.slice(0, 1)) {
    if (product.cartCount >= 3 && product.totalSold === 0) {
      recommendations.push({
        id: `cart-opportunity-${product.name}`,
        type: 'info',
        title: 'Peluang Konversi Keranjang',
        message: `"${product.name}" ada di ${product.cartCount} keranjang pembeli. Chat proaktif bisa mendorong checkout.`,
        actionLabel: 'Lihat Minat',
        actionRoute: '/product-engagement',
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'healthy-store',
      type: 'success',
      title: 'Toko Berjalan Baik',
      message:
        'Pantau analitik mingguan, jaga stok produk unggulan, dan respons negosiasi secara rutin.',
    });
  }

  return recommendations.slice(0, 6);
};

export const getSalesStats = async (sellerId: string) => {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const sevenDaysAgo = startOfDay(new Date());
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const [
    stats,
    statusCounts,
    thisMonthStats,
    lastMonthStats,
    recentOrders,
    topProductGroups,
    pendingOrders,
    activeNegotiations,
    cancelledCount,
    sellerProducts,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: { sellerId },
      _sum: { totalAmount: true, totalQuantity: true },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: { sellerId },
      _count: { id: true },
    }),
    prisma.order.aggregate({
      where: { sellerId, createdAt: { gte: startOfThisMonth } },
      _sum: { totalAmount: true, totalQuantity: true },
      _count: { id: true },
    }),
    prisma.order.aggregate({
      where: {
        sellerId,
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
      _sum: { totalAmount: true, totalQuantity: true },
      _count: { id: true },
    }),
    prisma.order.findMany({
      where: {
        sellerId,
        createdAt: { gte: sevenDaysAgo },
        status: { not: OrderStatus.CANCELLED },
      },
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          sellerId,
          status: { notIn: [OrderStatus.CANCELLED] },
        },
      },
      _sum: { quantity: true, subtotal: true },
      _count: { id: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 5,
    }),
    prisma.order.count({
      where: {
        sellerId,
        status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING] },
      },
    }),
    prisma.negotiation.count({
      where: {
        sellerId,
        status: { in: [NegotiationStatus.OPEN_NEGOTIATION, NegotiationStatus.OFFER_SUBMITTED] },
      },
    }),
    prisma.order.count({
      where: { sellerId, status: OrderStatus.CANCELLED },
    }),
    prisma.product.findMany({
      where: { userId: sellerId, status: { not: 'DELETED' } },
      select: {
        id: true,
        name: true,
        stock: true,
        minOrder: true,
        totalSold: true,
        thumbnailUrl: true,
        pricePerUnit: true,
        _count: { select: { productLikes: true, cartItems: true } },
      },
    }),
  ]);

  const totalOrders = stats._count.id || 0;
  const totalRevenue = toNumber(stats._sum.totalAmount);
  const thisMonthRevenue = toNumber(thisMonthStats._sum.totalAmount);
  const lastMonthRevenue = toNumber(lastMonthStats._sum.totalAmount);
  const thisMonthOrders = thisMonthStats._count.id || 0;
  const lastMonthOrders = lastMonthStats._count.id || 0;

  const productMap = new Map(sellerProducts.map((p) => [p.id, p]));
  const topProducts = topProductGroups
    .map((group) => {
      const product = productMap.get(group.productId);
      if (!product) return null;
      return {
        productId: group.productId,
        name: product.name,
        thumbnailUrl: product.thumbnailUrl,
        revenue: toNumber(group._sum.subtotal),
        quantitySold: toNumber(group._sum.quantity),
        orderCount: group._count.id,
        pricePerUnit: toNumber(product.pricePerUnit),
      };
    })
    .filter(Boolean);

  const totalLikes = sellerProducts.reduce((sum, p) => sum + p._count.productLikes, 0);
  const totalInCart = sellerProducts.reduce((sum, p) => sum + p._count.cartItems, 0);
  const completedOrders =
    statusCounts.find((s) => s.status === OrderStatus.COMPLETED)?._count.id || 0;
  const cancellationRate = totalOrders > 0 ? Math.round((cancelledCount / totalOrders) * 100) : 0;
  const conversionRate = totalInCart > 0 ? Math.round((totalOrders / totalInCart) * 100) : 0;

  const lowStockProducts = sellerProducts
    .filter((p) => toNumber(p.stock) <= toNumber(p.minOrder))
    .map((p) => ({ productId: p.id, name: p.name, stock: toNumber(p.stock) }));

  const highInterestLowSales = sellerProducts
    .filter(
      (p) => (p._count.productLikes >= 2 || p._count.cartItems >= 2) && toNumber(p.totalSold) === 0,
    )
    .sort(
      (a, b) =>
        b._count.productLikes + b._count.cartItems - (a._count.productLikes + a._count.cartItems),
    )
    .map((p) => ({
      productId: p.id,
      name: p.name,
      likeCount: p._count.productLikes,
      cartCount: p._count.cartItems,
    }));

  const topInCart = [...sellerProducts]
    .filter((p) => p._count.cartItems > 0)
    .sort((a, b) => b._count.cartItems - a._count.cartItems)
    .map((p) => ({
      productId: p.id,
      name: p.name,
      cartCount: p._count.cartItems,
      totalSold: toNumber(p.totalSold),
    }));

  const recommendations = buildSalesRecommendations({
    pendingOrders,
    activeNegotiations,
    revenueGrowth: pctChange(thisMonthRevenue, lastMonthRevenue),
    thisMonthOrders,
    cancellationRate,
    lowStockProducts,
    highInterestLowSales,
    topInCart,
  });

  return {
    tier: 'basic',
    totalRevenue,
    totalOrders,
    totalQuantity: toNumber(stats._sum.totalQuantity),
    statusDistribution: statusCounts.map((s) => ({
      status: s.status,
      count: s._count.id,
    })),
    recentSales: buildDailySales(recentOrders),
    period: {
      thisMonth: {
        revenue: thisMonthRevenue,
        orders: thisMonthOrders,
        quantity: toNumber(thisMonthStats._sum.totalQuantity),
      },
      lastMonth: {
        revenue: lastMonthRevenue,
        orders: lastMonthOrders,
        quantity: toNumber(lastMonthStats._sum.totalQuantity),
      },
      revenueGrowth: pctChange(thisMonthRevenue, lastMonthRevenue),
      ordersGrowth: pctChange(thisMonthOrders, lastMonthOrders),
    },
    insights: {
      pendingOrders,
      activeNegotiations,
      completedOrders,
      cancellationRate,
      totalLikes,
      totalInCart,
      conversionRate,
      averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    },
    topProducts,
    lowStockProducts,
    recommendations,
  };
};
