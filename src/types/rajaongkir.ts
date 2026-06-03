export type RajaOngkirMeta = {
  message: string;
  code: number;
  status: string;
};

export type RajaOngkirApiResponse<T> = {
  meta: RajaOngkirMeta;
  data: T;
};

export type RajaOngkirDestination = {
  id: number;
  label: string;
  province_name?: string;
  city_name?: string;
  district_name?: string;
  subdistrict_name?: string;
  zip_code?: string;
};

export type RajaOngkirShippingOption = {
  name: string;
  code: string;
  service: string;
  description: string;
  cost: number;
  etd: string;
};

export type RajaOngkirWaybillSummary = {
  courier_code?: string;
  courier_name?: string;
  waybill_number?: string;
  service_code?: string;
  waybill_date?: string;
  shipper_name?: string;
  receiver_name?: string;
  origin?: string;
  destination?: string;
  status?: string;
};

export type RajaOngkirWaybillManifest = {
  manifest_code?: string;
  manifest_description?: string;
  manifest_date?: string;
  manifest_time?: string;
  city_name?: string;
};

export type RajaOngkirWaybillData = {
  delivered?: boolean;
  summary?: RajaOngkirWaybillSummary;
  details?: Record<string, unknown>;
  delivery_status?: Record<string, unknown>;
  manifest?: RajaOngkirWaybillManifest[];
};

export type KomshipPickupVehicleType = 'Motor' | 'Mobil' | 'Truk';
export type WeightUnit = 'KG' | 'TON';

export type KomshipPickupVehicleOption = {
  code: KomshipPickupVehicleType;
  label: string;
  minTotalWeight: number;
  maxPerOrderWeight?: number;
  weightUnit: WeightUnit;
  notes: string;
};

export type KomshipPickupRequestItem = {
  order_no: string;
};

export type KomshipPickupRequestBody = {
  pickup_date: string;
  pickup_time: string;
  pickup_vehicle: KomshipPickupVehicleType;
  orders: KomshipPickupRequestItem[];
};

export type KomshipPickupResultItem = {
  status: 'success' | 'failed';
  order_no: string;
  awb: string;
};
