/** Input dari client saat checkout — diverifikasi ke RajaOngkir */
export type ShippingSelectionInput = {
  originId: number;
  destinationId: number;
  destinationLabel?: string;
  weightGrams: number;
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
