import logger from '../../src/config/logger.js';

export async function seedPlatformSettings(prisma) {
  logger.info('🌱 [29] Seeding platform settings...');

  const rows = [
    { key: 'SUPPORT_WHATSAPP', value: '6281234567890' },
    { key: 'SUPPORT_EMAIL', value: 'cs@bisa.id' },
    { key: 'PUBLIC_VERIFY_BASE_URL', value: 'http://localhost:3001' },
    { key: 'XENDIT_INVOICE_DURATION_SECONDS', value: '86400' },
    { key: 'XENDIT_DEFAULT_INVOICE_CATEGORY', value: 'BIOMASS' },
  ];

  for (const row of rows) {
    await prisma.platformSetting.upsert({
      where: { key: row.key },
      update: { value: row.value },
      create: row,
    });
  }

  logger.info(`✅ [29] ${rows.length} platform settings seeded.`);
}
