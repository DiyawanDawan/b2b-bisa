import { Prisma } from '#prisma';

/**
 * Type definition for CustomerAddress from Prisma with Includes
 */
interface CustomerAddressWithAddress {
  id: string;
  label: string;
  addressId: string;
  address: {
    fullAddress: string;
    zipCode: string;
    latitude: Prisma.Decimal | null;
    longitude: Prisma.Decimal | null;
    countryId: string;
    provinceId?: string | null;
    regencyId?: string | null;
    districtId?: string | null;
    villageId?: string | null;
    country?: { name: string } | null;
    province?: { name: string } | null;
    regency?: { name: string } | null;
    district?: { name: string } | null;
    village?: { name: string } | null;
  };
}

/**
 * Customer Address Data Transformer
 * Meratakan (flatten) data alamat hasil query Prisma dari nested ke flat structure
 */
export const transformAddress = (ca: CustomerAddressWithAddress) => {
  if (!ca || !ca.address) return ca;
  return {
    id: ca.id,
    label: ca.label,
    fullAddress: ca.address.fullAddress,
    zipCode: ca.address.zipCode,
    country: ca.address.country?.name || null,
    province: ca.address.province?.name || null,
    regency: ca.address.regency?.name || null,
    district: ca.address.district?.name || null,
    village: ca.address.village?.name || null,
    latitude: ca.address.latitude,
    longitude: ca.address.longitude,
    // Kita sertakan ID mentah juga jika FE butuh untuk edit form
    addressId: ca.addressId,
    countryId: ca.address.countryId,
    provinceId: ca.address.provinceId,
    regencyId: ca.address.regencyId,
    districtId: ca.address.districtId,
    villageId: ca.address.villageId,
  };
};
