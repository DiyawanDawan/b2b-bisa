import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { FeeCalculationType, PlatformFeeType, Prisma, ProductMode } from '#prisma';
import { roundIdrDecimal } from '#utils/currency.util';

export type FeeApplyScope = 'CHECKOUT' | 'WITHDRAWAL' | 'BIOMASS' | 'CARBON' | 'SUBSCRIPTION';

export type FeeApplyMode = 'AUTO' | 'GENERAL' | 'SPECIFIC';

export type FeeLine = {
  code: PlatformFeeType;
  label: string;
  description: string | null;
  calcType: FeeCalculationType;
  rateOrAmount: number;
  amount: number;
};

export type CheckoutFeeContext = {
  /** Subtotal setelah diskon voucher (dasar % fee). */
  subtotal: Prisma.Decimal;
  /** Ongkir kurir aktual (RajaOngkir / BISA Express). */
  courierFee?: Prisma.Decimal;
  productModes?: ProductMode[];
  /** Ada spesifikasi karbon pada produk keranjang. */
  hasCarbonProduct?: boolean;
};

const FEE_LABELS: Record<PlatformFeeType, string> = {
  TRANSACTION_FEE: 'Biaya Transaksi',
  WITHDRAWAL_FEE: 'Biaya Penarikan',
  ADMIN_FEE: 'Biaya Admin',
  LOGISTICS_FEE: 'Biaya Penanganan Logistik',
  CARBON_FEE: 'Biaya Karbon',
  BIOMASS_FEE: 'Biaya Biomassa',
  SUBSCRIPTION: 'Langganan',
  VAT: 'PPN',
};

/** Default scope per tipe saat applyMode = AUTO. */
export const DEFAULT_FEE_SCOPES: Record<PlatformFeeType, FeeApplyScope[]> = {
  TRANSACTION_FEE: ['CHECKOUT'],
  VAT: ['CHECKOUT'],
  ADMIN_FEE: ['CHECKOUT'],
  LOGISTICS_FEE: ['CHECKOUT'],
  CARBON_FEE: ['CARBON'],
  BIOMASS_FEE: ['BIOMASS'],
  WITHDRAWAL_FEE: ['WITHDRAWAL'],
  SUBSCRIPTION: ['SUBSCRIPTION'],
};

const CHECKOUT_GENERAL_TYPES: PlatformFeeType[] = [
  PlatformFeeType.TRANSACTION_FEE,
  PlatformFeeType.VAT,
  PlatformFeeType.ADMIN_FEE,
  PlatformFeeType.LOGISTICS_FEE,
];

type FeeRow = {
  name: PlatformFeeType;
  description: string | null;
  type: FeeCalculationType;
  amount: Prisma.Decimal;
  isActive: boolean;
  applyMode?: string | null;
  applyScopes?: unknown;
};

const computeLineAmount = (
  setting: Pick<FeeRow, 'type' | 'amount'>,
  base: Prisma.Decimal,
): Prisma.Decimal => {
  if (setting.type === FeeCalculationType.PERCENTAGE) {
    return base.mul(new Prisma.Decimal(setting.amount.toString()).div(100));
  }
  return new Prisma.Decimal(setting.amount.toString());
};

const parseScopes = (raw: unknown): FeeApplyScope[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is FeeApplyScope =>
      typeof s === 'string' &&
      ['CHECKOUT', 'WITHDRAWAL', 'BIOMASS', 'CARBON', 'SUBSCRIPTION'].includes(s),
  );
};

export const resolveFeeScopes = (fee: FeeRow): FeeApplyScope[] => {
  const mode = (fee.applyMode ?? 'AUTO').toUpperCase() as FeeApplyMode;
  if (mode === 'GENERAL') {
    return CHECKOUT_GENERAL_TYPES.includes(fee.name)
      ? ['CHECKOUT']
      : (DEFAULT_FEE_SCOPES[fee.name] ?? ['CHECKOUT']);
  }
  if (mode === 'SPECIFIC') {
    const scopes = parseScopes(fee.applyScopes);
    return scopes.length > 0 ? scopes : (DEFAULT_FEE_SCOPES[fee.name] ?? []);
  }
  return DEFAULT_FEE_SCOPES[fee.name] ?? [];
};

const feeAppliesToCheckout = (fee: FeeRow, ctx: CheckoutFeeContext): boolean => {
  if (!fee.isActive) return false;
  const scopes = resolveFeeScopes(fee);
  if (scopes.includes('CHECKOUT')) return true;
  if (
    scopes.includes('BIOMASS') &&
    (ctx.productModes ?? []).includes(ProductMode.BIOMASS_MATERIAL)
  ) {
    return true;
  }
  if (scopes.includes('CARBON') && ctx.hasCarbonProduct) {
    return true;
  }
  return false;
};

export const listActivePlatformFees = async () => {
  const rows = await prisma.platformFeeSetting.findMany({
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    amount: Number(row.amount),
    isActive: row.isActive,
    applyMode: (row as FeeRow).applyMode ?? 'AUTO',
    applyScopes: resolveFeeScopes(row as FeeRow),
    label: FEE_LABELS[row.name] ?? row.name,
  }));
};

export type CheckoutFinancials = {
  subtotal: Prisma.Decimal;
  platformFee: Prisma.Decimal;
  logisticsFee: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  feeLines: FeeLine[];
  feeBreakdownSnapshot: FeeLine[];
};

/**
 * Hitung biaya checkout dari semua PlatformFeeSetting aktif sesuai scope.
 * - platformFee: TRANSACTION_FEE (+ ADMIN/CARBON/BIOMASS jika ikut checkout)
 * - vatAmount: VAT
 * - logisticsFee: ongkir kurir + LOGISTICS_FEE platform (penanganan)
 */
export const calculateCheckoutFinancials = async (
  ctx: CheckoutFeeContext,
): Promise<CheckoutFinancials> => {
  const settings = (await prisma.platformFeeSetting.findMany()) as FeeRow[];
  const activeForCheckout = settings.filter((f) => feeAppliesToCheckout(f, ctx));

  const txFee = activeForCheckout.find((f) => f.name === PlatformFeeType.TRANSACTION_FEE);
  const vatFee = activeForCheckout.find((f) => f.name === PlatformFeeType.VAT);

  if (!txFee) {
    throw new AppError(
      'Konfigurasi biaya layanan (Platform Fee) tidak ditemukan atau tidak aktif. Harap hubungi administrator.',
      500,
    );
  }
  if (!vatFee) {
    throw new AppError(
      'Konfigurasi PPN (VAT) tidak ditemukan atau tidak aktif. Harap hubungi administrator.',
      500,
    );
  }

  const subtotal = roundIdrDecimal(ctx.subtotal);
  const courierFee = roundIdrDecimal(ctx.courierFee ?? new Prisma.Decimal(0));
  const feeLines: FeeLine[] = [];

  const pushLine = (setting: FeeRow, base: Prisma.Decimal) => {
    const amount = roundIdrDecimal(computeLineAmount(setting, base));
    feeLines.push({
      code: setting.name,
      label: FEE_LABELS[setting.name] ?? setting.name,
      description: setting.description,
      calcType: setting.type,
      rateOrAmount: Number(setting.amount),
      amount: Number(amount),
    });
    return amount;
  };

  let platformFee = new Prisma.Decimal(0);
  let vatAmount = new Prisma.Decimal(0);
  let logisticsExtra = new Prisma.Decimal(0);

  for (const setting of activeForCheckout) {
    if (setting.name === PlatformFeeType.SUBSCRIPTION) continue;
    if (setting.name === PlatformFeeType.WITHDRAWAL_FEE) continue;

    if (setting.name === PlatformFeeType.VAT) {
      vatAmount = pushLine(setting, subtotal);
      continue;
    }
    if (setting.name === PlatformFeeType.LOGISTICS_FEE) {
      logisticsExtra = pushLine(setting, subtotal);
      continue;
    }
    // TRANSACTION, ADMIN, CARBON, BIOMASS → platformFee bucket
    platformFee = platformFee.add(pushLine(setting, subtotal));
  }

  const logisticsFee = roundIdrDecimal(courierFee.add(logisticsExtra));
  const totalAmount = roundIdrDecimal(subtotal.add(platformFee).add(vatAmount).add(logisticsFee));

  return {
    subtotal,
    platformFee: roundIdrDecimal(platformFee),
    logisticsFee,
    vatAmount: roundIdrDecimal(vatAmount),
    totalAmount,
    feeLines,
    feeBreakdownSnapshot: feeLines,
  };
};

export const calculateWithdrawalFee = async (
  withdrawAmount: Prisma.Decimal,
): Promise<{ fee: Prisma.Decimal; feeLine: FeeLine | null }> => {
  const setting = (await prisma.platformFeeSetting.findUnique({
    where: { name: PlatformFeeType.WITHDRAWAL_FEE },
  })) as FeeRow | null;

  if (!setting || !setting.isActive) {
    return { fee: new Prisma.Decimal(0), feeLine: null };
  }
  const scopes = resolveFeeScopes(setting);
  if (!scopes.includes('WITHDRAWAL') && (setting.applyMode ?? 'AUTO') === 'SPECIFIC') {
    return { fee: new Prisma.Decimal(0), feeLine: null };
  }

  const fee = roundIdrDecimal(computeLineAmount(setting, withdrawAmount));
  return {
    fee,
    feeLine: {
      code: setting.name,
      label: FEE_LABELS.WITHDRAWAL_FEE,
      description: setting.description,
      calcType: setting.type,
      rateOrAmount: Number(setting.amount),
      amount: Number(fee),
    },
  };
};
