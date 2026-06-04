export type PlatformSettingFieldType = 'text' | 'url' | 'email' | 'phone' | 'number';

export interface PlatformSettingDefinition {
  key: string;
  label: string;
  description: string;
  type: PlatformSettingFieldType;
  placeholder?: string;
  envFallback?: string;
}

export const PLATFORM_SETTING_DEFINITIONS: PlatformSettingDefinition[] = [
  {
    key: 'SUPPORT_WHATSAPP',
    label: 'WhatsApp Customer Service',
    description:
      'Nomor WhatsApp untuk tombol hubungi CS di aplikasi mobile (format 628xxxxxxxx).',
    type: 'phone',
    placeholder: '6281234567890',
    envFallback: 'SUPPORT_WHATSAPP',
  },
  {
    key: 'SUPPORT_EMAIL',
    label: 'Email Customer Service',
    description: 'Alamat email dukungan BISA.',
    type: 'email',
    placeholder: 'cs@bisa.id',
    envFallback: 'SUPPORT_EMAIL',
  },
  {
    key: 'PUBLIC_VERIFY_BASE_URL',
    label: 'URL verifikasi publik (QR tagihan)',
    description:
      'Base URL landing verify/track (admin web). Contoh: https://admin.bisa.id atau http://localhost:3001',
    type: 'url',
    placeholder: 'http://localhost:3001',
    envFallback: 'PUBLIC_VERIFY_BASE_URL',
  },
  {
    key: 'XENDIT_INVOICE_DURATION_SECONDS',
    label: 'Durasi invoice Xendit (detik)',
    description: 'Batas waktu pembayaran invoice sebelum kedaluwarsa.',
    type: 'number',
    placeholder: '86400',
    envFallback: 'XENDIT_INVOICE_DURATION_SECONDS',
  },
  {
    key: 'XENDIT_DEFAULT_INVOICE_CATEGORY',
    label: 'Kategori default invoice Xendit',
    description: 'Kategori produk pada invoice pembayaran (mis. BIOMASS).',
    type: 'text',
    placeholder: 'BIOMASS',
    envFallback: 'XENDIT_DEFAULT_INVOICE_CATEGORY',
  },
];

export const ALLOWED_PLATFORM_SETTING_KEYS = new Set(
  PLATFORM_SETTING_DEFINITIONS.map((d) => d.key),
);
