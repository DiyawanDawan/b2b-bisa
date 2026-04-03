import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';

export async function seedFinancial(prisma) {
  logger.info('🌱 [03] Seeding Hardened Financial Data...');

  // 1. PLATFORM FEE SETTINGS (Using PlatformFeeType Enum)
  const fees = [
    {
      name: 'TRANSACTION_FEE',
      description: 'Platform fee per sales transaction',
      type: 'PERCENTAGE',
      amount: 3.0,
    },
    {
      name: 'WITHDRAWAL_FEE',
      description: 'Biaya admin transfer antar bank',
      type: 'FIXED',
      amount: 4500,
    },
    { name: 'ADMIN_FEE', description: 'Biaya administrasi sistem', type: 'FIXED', amount: 10000 },
    {
      name: 'LOGISTICS_FEE',
      description: 'Biaya kurir dan penanganan logistik',
      type: 'PERCENTAGE',
      amount: 5.0,
    },
    {
      name: 'CARBON_FEE',
      description: 'Biaya verifikasi kredit karbon',
      type: 'FIXED',
      amount: 25000,
    },
    {
      name: 'BIOMASS_FEE',
      description: 'Biaya pengolahan limbah biomassa',
      type: 'PERCENTAGE',
      amount: 2.0,
    },
    {
      name: 'SUBSCRIPTION',
      description: 'Langganan BISA PRO (Bulanan)',
      type: 'FIXED',
      amount: 250000,
    },
  ];

  for (const fee of fees) {
    await prisma.platformFeeSetting.upsert({
      where: { name: fee.name },
      update: { amount: fee.amount, type: fee.type },
      create: fee,
    });
  }

  // 2. PAYMENT CHANNELS
  const paymentChannels = [
    { name: 'Mandiri Virtual Account', code: 'MANDIRI_VA', group: 'BANK_TRANSFER' },
    { name: 'BCA Virtual Account', code: 'BCA_VA', group: 'BANK_TRANSFER' },
    { name: 'BNI Virtual Account', code: 'BNI_VA', group: 'BANK_TRANSFER' },
    { name: 'BRI Virtual Account', code: 'BRI_VA', group: 'BANK_TRANSFER' },
    { name: 'QRIS By Xendit', code: 'QRIS', group: 'QRIS' },
    { name: 'OVO', code: 'OVO', group: 'E_WALLET' },
    { name: 'Dana', code: 'DANA', group: 'E_WALLET' },
    { name: 'ShopeePay', code: 'SHOPEEPAY', group: 'E_WALLET' },
  ];

  for (const pc of paymentChannels) {
    await prisma.paymentChannel.upsert({
      where: { code: pc.code },
      update: {},
      create: pc,
    });
  }

  // 3. PAYOUT BANKS
  const payoutBanks = [
    { name: 'Bank Mandiri', code: '008' },
    { name: 'Bank Central Asia', code: '014' },
    { name: 'Bank Negara Indonesia', code: '009' },
    { name: 'Bank Rakyat Indonesia', code: '002' },
    { name: 'Bank Syariah Indonesia', code: '451' },
    { name: 'Bank Jago', code: '542' },
  ];

  for (const bank of payoutBanks) {
    await prisma.payoutBank.upsert({
      where: { code: bank.code },
      update: {},
      create: bank,
    });
  }

  // 4. PLATFORM BANK ACCOUNT
  const mandiri = await prisma.paymentChannel.findUnique({ where: { code: 'MANDIRI_VA' } });
  if (mandiri) {
    await prisma.platformBankAccount.upsert({
      where: { id: 'default-platform-bank' }, // Use a fixed ID or find existing
      update: {},
      create: {
        id: 'default-platform-bank',
        paymentChannelId: mandiri.id,
        accountNumber: '889012345678',
        accountName: 'PT BISA EKOSISTEM INDONESIA',
      },
    });
  }

  logger.info('✅ [03] Full Financial Data seeded.');
}
