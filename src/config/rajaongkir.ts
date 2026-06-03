import { optional } from '#utils/env.util';

/** Live base — [RajaOngkir EndPoint](https://www.rajaongkir.com/docs/shipping-cost/getting_started/endpoint) */
export const RAJAONGKIR_BASE_URL = optional(
  'RAJAONGKIR_BASE_URL',
  'https://rajaongkir.komerce.id/api/v1',
).replace(/\/$/, '');

export const SHIPPING_COST_API_KEY =
  optional('SHIPPING_COST_API_KEY') || optional('RAJAONGKIR_API_KEY');
export const KOMSHIP_DELIVERY_API_KEY = optional(
  'KOMSHIP_DELIVERY_API_KEY',
  SHIPPING_COST_API_KEY ?? '',
);
export const KOMSHIP_DELIVERY_BASE_URL = optional(
  'KOMSHIP_DELIVERY_BASE_URL',
  'https://api-sandbox.collaborator.komerce.id/order/api/v1',
).replace(/\/$/, '');
export const PICKUP_VEHICLE_SETTINGS_KEY = optional(
  'PICKUP_VEHICLE_SETTINGS_KEY',
  'SHIPPING_PICKUP_VEHICLE_OPTIONS_JSON',
);
export const ACTIVE_COURIERS_SETTINGS_KEY = optional(
  'ACTIVE_COURIERS_SETTINGS_KEY',
  'SHIPPING_ACTIVE_COURIERS',
);

/** Kode kurir default (pisah `:`) — [Calculate Domestic Cost](https://www.rajaongkir.com/docs/shipping-cost/endpoint-rajaongkir-for-search-base/calculate-domestic-cost) */
export const RAJAONGKIR_DEFAULT_COURIERS = optional(
  'RAJAONGKIR_DEFAULT_COURIERS',
  'jne:jnt:sicepat:anteraja:tiki:pos',
);

export const isRajaOngkirConfigured = (): boolean => Boolean(SHIPPING_COST_API_KEY);
export const isKomshipDeliveryConfigured = (): boolean => Boolean(KOMSHIP_DELIVERY_API_KEY);
