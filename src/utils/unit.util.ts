import { UnitStatus } from '#prisma';

/**
 * Skala relatif antar UnitStatus (basis = KG).
 * Domain app = KG/TON saja — bukan gram.
 */
export const UNIT_SCALE: Record<UnitStatus, number> = {
  [UnitStatus.KG]: 1,
  [UnitStatus.TON]: 1000, // 1 TON = 1000 KG
};

/** Konversi qty antar UnitStatus (KG ↔ TON). */
export const convertUnit = (quantity: number, from: UnitStatus, to: UnitStatus): number => {
  if (quantity <= 0) return 0;
  if (from === to) return quantity;
  const inKg = quantity * UNIT_SCALE[from];
  return inKg / UNIT_SCALE[to];
};

/** Bridge ke gram — HANYA untuk payload API RajaOngkir (eksternal). */
export const toGrams = (quantity: number, unit: UnitStatus): number => {
  if (quantity <= 0) return 0;
  const kg = convertUnit(quantity, unit, UnitStatus.KG);
  return Math.round(kg * 1000);
};

export const formatQty = (quantity: number, unit: UnitStatus): string => {
  const rounded =
    unit === UnitStatus.TON
      ? quantity.toFixed(quantity % 1 === 0 ? 0 : 3)
      : quantity.toFixed(quantity % 1 === 0 ? 0 : 1);
  return `${rounded} ${unit}`;
};

/** Apakah qty masuk band [min,max] dalam bandUnit. */
export const isWithinWeightBand = (params: {
  quantity: number;
  quantityUnit: UnitStatus;
  minWeight: number;
  maxWeight: number;
  bandUnit: UnitStatus;
}): boolean => {
  const qty = convertUnit(params.quantity, params.quantityUnit, params.bandUnit);
  return qty >= params.minWeight && qty <= params.maxWeight;
};
