import { z } from 'zod';

export const updateAddressSchema = z.object({
  label: z.string().min(1, 'Label alamat wajib diisi (misal: Rumah, Kantor)').optional(),
  countryId: z.string().optional(),
  provinceId: z.string().optional(),
  regencyId: z.string().optional(),
  districtId: z.string().optional(),
  villageId: z.string().optional(),
  fullAddress: z.string().min(5, 'Alamat lengkap minimal 5 karakter').optional(),
  zipCode: z.string().optional(),
  phone: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});

export const createAddressSchema = updateAddressSchema.extend({
  label: z.string().min(1, 'Label alamat wajib diisi'),
  countryId: z.string().min(1, 'ID Negara wajib diisi'),
  provinceId: z.string().min(1, 'Provinsi wajib dipilih').optional(),
  regencyId: z.string().min(1, 'Kota/Kabupaten wajib dipilih').optional(),
  districtId: z.string().min(1, 'Kecamatan wajib dipilih').optional(),
  villageId: z.string().min(1, 'Desa/Kelurahan wajib dipilih').optional(),
  fullAddress: z.string().min(5, 'Alamat lengkap minimal 5 karakter'),
  zipCode: z.string().min(1, 'Kode POS wajib diisi'),
});

export const operatingHourSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  openTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format jam harus HH:mm'),
  closeTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format jam harus HH:mm'),
  isClosed: z.boolean().default(false),
});

export const updateOperatingHoursSchema = z.array(operatingHourSchema);
