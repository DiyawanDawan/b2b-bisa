import { UnitStatus } from '#prisma';

/** Input dari client saat checkout — berat dalam UnitStatus produk */
export type ShippingSelectionInput = {
  originId: number;
  destinationId: number;
  destinationLabel?: string;
  weight: number;
  weightUnit: UnitStatus;
  courierCode: string;
  serviceCode?: string;
  serviceName?: string;
  cost: number;
  etd?: string;
};

/** Metadata terverifikasi — disimpan ke `order_shipping` + snapshot JSON */
export type LogisticsSnapshotMeta = ShippingSelectionInput & {
  verifiedService?: string;
  verifiedDescription?: string;
  courierName?: string;
};
