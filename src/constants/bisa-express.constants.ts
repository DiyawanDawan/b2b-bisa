import { BisaExpressStatus, UnitStatus } from '#prisma';

export const BISA_EXPRESS_COURIER_CODE = 'bisa_express';
export const BISA_EXPRESS_COURIER_LABEL = 'BISA Express';

/**
 * Kode layanan yang dikenal sistem.
 * Batas berat / ketersediaan → tabel `bisa_express_service_rules` (admin setting),
 * BUKAN hardcode di file ini.
 */
export const BISA_EXPRESS_SERVICE_TYPES = [
  'REGULER',
  'EXPRESS',
  'SAME_DAY',
  'CARGO',
  'VIP_EXPRESS',
] as const;
export type BisaExpressServiceType = (typeof BISA_EXPRESS_SERVICE_TYPES)[number];

export const VIP_EXPRESS_SERVICE = 'VIP_EXPRESS' as const;

/** Seed default saja — runtime membaca DB. Berat dalam UnitStatus (bukan gram). */
export const DEFAULT_SERVICE_RULE_SEEDS: Array<{
  serviceType: BisaExpressServiceType;
  label: string;
  minWeight: number;
  maxWeight: number;
  weightUnit: UnitStatus;
  alwaysAvailable: boolean;
  sortOrder: number;
  note: string;
}> = [
  {
    serviceType: 'SAME_DAY',
    label: 'Same Day',
    minWeight: 0,
    maxWeight: 20,
    weightUnit: UnitStatus.KG,
    alwaysAvailable: false,
    sortOrder: 10,
    note: 'Maks 20 KG · intra-zona',
  },
  {
    serviceType: 'EXPRESS',
    label: 'Express',
    minWeight: 0,
    maxWeight: 50,
    weightUnit: UnitStatus.KG,
    alwaysAvailable: false,
    sortOrder: 20,
    note: 'Maks 50 KG · 1-2 hari',
  },
  {
    serviceType: 'REGULER',
    label: 'Reguler',
    minWeight: 0,
    maxWeight: 50,
    weightUnit: UnitStatus.KG,
    alwaysAvailable: false,
    sortOrder: 30,
    note: 'Maks 50 KG · 2-5 hari',
  },
  {
    serviceType: 'CARGO',
    label: 'Cargo',
    minWeight: 0.05,
    maxWeight: 999_999,
    weightUnit: UnitStatus.TON,
    alwaysAvailable: false,
    sortOrder: 40,
    note: 'Wajib untuk ≥ 0.05 TON (~50 KG)',
  },
  {
    serviceType: 'VIP_EXPRESS',
    label: 'VIP Express',
    minWeight: 0,
    maxWeight: 999_999,
    weightUnit: UnitStatus.KG,
    alwaysAvailable: true,
    sortOrder: 5,
    note: 'Selalu tersedia · ontime · tarif premium',
  },
];

export const STATUS_TRANSITIONS: Record<BisaExpressStatus, BisaExpressStatus[]> = {
  [BisaExpressStatus.AWAITING_PICKUP]: [
    BisaExpressStatus.PICKUP_ASSIGNED,
    BisaExpressStatus.CANCELLED,
  ],
  [BisaExpressStatus.PICKUP_ASSIGNED]: [
    BisaExpressStatus.PICKED_UP,
    BisaExpressStatus.AWAITING_PICKUP,
    BisaExpressStatus.CANCELLED,
  ],
  [BisaExpressStatus.PICKED_UP]: [
    BisaExpressStatus.IN_TRANSIT_TO_HUB,
    BisaExpressStatus.OUT_FOR_DELIVERY,
  ],
  [BisaExpressStatus.IN_TRANSIT_TO_HUB]: [BisaExpressStatus.AT_ORIGIN_HUB],
  [BisaExpressStatus.AT_ORIGIN_HUB]: [
    BisaExpressStatus.IN_TRANSIT,
    BisaExpressStatus.OUT_FOR_DELIVERY,
  ],
  [BisaExpressStatus.IN_TRANSIT]: [BisaExpressStatus.AT_DESTINATION_HUB],
  [BisaExpressStatus.AT_DESTINATION_HUB]: [BisaExpressStatus.OUT_FOR_DELIVERY],
  [BisaExpressStatus.OUT_FOR_DELIVERY]: [
    BisaExpressStatus.DELIVERED,
    BisaExpressStatus.FAILED_DELIVERY,
  ],
  [BisaExpressStatus.FAILED_DELIVERY]: [
    BisaExpressStatus.OUT_FOR_DELIVERY,
    BisaExpressStatus.RETURNED,
  ],
  [BisaExpressStatus.DELIVERED]: [],
  [BisaExpressStatus.RETURNED]: [],
  [BisaExpressStatus.CANCELLED]: [],
};

export const statusToDeliveryLabel = (status: BisaExpressStatus): string => {
  const map: Record<BisaExpressStatus, string> = {
    [BisaExpressStatus.AWAITING_PICKUP]: 'Menunggu penjemputan',
    [BisaExpressStatus.PICKUP_ASSIGNED]: 'Kurir ditugaskan',
    [BisaExpressStatus.PICKED_UP]: 'Barang dijemput',
    [BisaExpressStatus.IN_TRANSIT_TO_HUB]: 'Menuju hub',
    [BisaExpressStatus.AT_ORIGIN_HUB]: 'Di hub asal',
    [BisaExpressStatus.IN_TRANSIT]: 'Dalam perjalanan',
    [BisaExpressStatus.AT_DESTINATION_HUB]: 'Di hub tujuan',
    [BisaExpressStatus.OUT_FOR_DELIVERY]: 'Sedang diantar',
    [BisaExpressStatus.DELIVERED]: 'Terkirim',
    [BisaExpressStatus.FAILED_DELIVERY]: 'Gagal kirim',
    [BisaExpressStatus.RETURNED]: 'Dikembalikan',
    [BisaExpressStatus.CANCELLED]: 'Dibatalkan',
  };
  return map[status] ?? status;
};
