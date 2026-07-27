import { Prisma } from '#prisma';
import {
  decryptField,
  decryptJsonValue,
  encryptField,
  encryptJsonValue,
  isEncryptedPayload,
} from '#utils/encryption.util';

/** Address.fullAddress — random IV AES-256-GCM. */
export const sealAddress = (value: string | null | undefined): string | null | undefined => {
  if (value == null || value === '') return value;
  return encryptField(value);
};

export const revealAddress = (value: string | null | undefined): string | null | undefined => {
  if (value == null || value === '') return value;
  return decryptField(value);
};

/** Address.phoneNumber — random IV (not unique). */
export const sealAddressPhone = (value: string | null | undefined): string | null | undefined => {
  if (value == null || value === '') return value;
  return encryptField(value);
};

export const revealAddressPhone = (value: string | null | undefined): string | null | undefined => {
  if (value == null || value === '') return value;
  return decryptField(value);
};

/** UserVerification.taxId */
export const sealTaxId = (value: string | null | undefined): string | null | undefined => {
  if (value == null || value === '') return value;
  return encryptField(value.trim());
};

export const revealTaxId = (value: string | null | undefined): string | null | undefined => {
  if (value == null || value === '') return value;
  return decryptField(value);
};

/** UserVerification.businessAddress */
export const sealBusinessAddress = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value == null || value === '') return value;
  return encryptField(value);
};

export const revealBusinessAddress = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value == null || value === '') return value;
  return decryptField(value);
};

/**
 * Order.shippingAddressSnapshot — store as JSON string ciphertext.
 * Reader accepts legacy plaintext objects during migration.
 */
export const sealShippingAddressSnapshot = (
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull => {
  if (value == null) return Prisma.JsonNull;
  if (typeof value === 'string' && isEncryptedPayload(value)) {
    return value as unknown as Prisma.InputJsonValue;
  }
  return encryptJsonValue(value) as unknown as Prisma.InputJsonValue;
};

export const revealShippingAddressSnapshot = <T = unknown>(stored: unknown): T | null => {
  const revealed = decryptJsonValue(stored);
  return (revealed as T) ?? null;
};

/** Decrypt Address PII fields in-place for authorized readers. */
export const revealAddressFields = <
  T extends { fullAddress?: string | null; phoneNumber?: string | null },
>(
  addr: T | null | undefined,
): T | null | undefined => {
  if (!addr) return addr;
  return {
    ...addr,
    ...(addr.fullAddress != null && { fullAddress: revealAddress(addr.fullAddress) as string }),
    ...(addr.phoneNumber != null && {
      phoneNumber: revealAddressPhone(addr.phoneNumber) as string | null,
    }),
  };
};

/** BisaExpressShipment contact name / POD recipient — random IV. */
export const sealShipmentContact = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value == null || value === '') return value;
  return encryptField(value);
};

export const revealShipmentContact = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value == null || value === '') return value;
  return decryptField(value);
};

/** Alias for shipment address/phone (same crypto as Address). */
export const sealShipmentAddress = sealAddress;
export const revealShipmentAddress = revealAddress;
export const sealShipmentPhone = sealAddressPhone;
export const revealShipmentPhone = revealAddressPhone;

export type ShipmentContactPii = {
  pickupAddress?: string | null;
  pickupContact?: string | null;
  pickupPhone?: string | null;
  deliveryAddress?: string | null;
  deliveryContact?: string | null;
  deliveryPhone?: string | null;
  podReceivedBy?: string | null;
};

/** Decrypt shipment pickup/delivery/POD PII for authorized participants. */
export const revealShipmentFields = <T extends ShipmentContactPii>(shipment: T): T => ({
  ...shipment,
  ...(shipment.pickupAddress != null && {
    pickupAddress: revealShipmentAddress(shipment.pickupAddress) as string,
  }),
  ...(shipment.pickupContact != null && {
    pickupContact: revealShipmentContact(shipment.pickupContact) as string,
  }),
  ...(shipment.pickupPhone != null && {
    pickupPhone: revealShipmentPhone(shipment.pickupPhone) as string,
  }),
  ...(shipment.deliveryAddress != null && {
    deliveryAddress: revealShipmentAddress(shipment.deliveryAddress) as string,
  }),
  ...(shipment.deliveryContact != null && {
    deliveryContact: revealShipmentContact(shipment.deliveryContact) as string,
  }),
  ...(shipment.deliveryPhone != null && {
    deliveryPhone: revealShipmentPhone(shipment.deliveryPhone) as string,
  }),
  ...(shipment.podReceivedBy != null && {
    podReceivedBy: revealShipmentContact(shipment.podReceivedBy) as string | null,
  }),
});

/** UserDocument.fileUrl — random IV AES-256-GCM. */
export const sealDocumentFile = (value: string | null | undefined): string | null | undefined => {
  if (value == null || value === '') return value;
  return encryptField(value);
};

export const revealDocumentFile = (value: string | null | undefined): string | null | undefined => {
  if (value == null || value === '') return value;
  return decryptField(value);
};

/** UserDocument.title — random IV AES-256-GCM. */
export const sealDocumentTitle = (value: string | null | undefined): string | null | undefined => {
  if (value == null || value === '') return value;
  return encryptField(value);
};

export const revealDocumentTitle = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value == null || value === '') return value;
  return decryptField(value);
};
