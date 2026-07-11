/**
 * Nomor tracking internal BISA (disimpan di ShipmentTracking.batch_id).
 * Format: TRK-{orderNumber} — unik & mudah dilacak bersama nomor pesanan.
 */
export const buildBisaTrackingNumber = (orderNumber: string): string => {
  const normalized = orderNumber.trim().toUpperCase();
  return `TRK-${normalized}`;
};

type ShipmentPayload = {
  batchId?: string | null;
  trackingNumber?: string;
  [key: string]: unknown;
};

type OrderWithShipment = {
  orderNumber?: string;
  shipment?: ShipmentPayload | null;
};

/** Sisipkan trackingNumber ke payload shipment untuk API mobile/admin. */
export const attachShipmentTrackingNumber = <T extends OrderWithShipment>(order: T): T => {
  if (!order.shipment || !order.orderNumber) return order;
  const trackingNumber =
    order.shipment.batchId?.toString().trim() || buildBisaTrackingNumber(order.orderNumber);
  return {
    ...order,
    shipment: {
      ...order.shipment,
      trackingNumber,
    },
  } as T;
};
