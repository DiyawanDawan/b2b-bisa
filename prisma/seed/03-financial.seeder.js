import logger from '../../src/config/logger.js';
import {
  readSeedCsv,
  parseAmount,
  mapPaymentTypeToGroup,
  mapPayoutChannelType,
} from './utils/csv-seed.util.js';

const LEGACY_PAYMENT_CODES = ['MANDIRI_VA', 'BCA_VA', 'BNI_VA', 'BRI_VA'];
const LEGACY_PAYOUT_CODES = ['008', '014', '009', '002', '451', '542'];

export async function seedFinancial(prisma) {
  logger.info('🌱 [03] Seeding Financial Data (CSV + Platform Fees)...');

  // 1. PLATFORM FEE SETTINGS
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
    {
      name: 'VAT',
      description: 'PPN (Pajak Pertambahan Nilai)',
      type: 'PERCENTAGE',
      amount: 11.0,
    },
  ];

  for (const fee of fees) {
    await prisma.platformFeeSetting.upsert({
      where: { name: fee.name },
      update: { amount: fee.amount, type: fee.type, description: fee.description },
      create: fee,
    });
  }

  // Deactivate legacy codes that don't match Xendit API
  await prisma.paymentChannel.updateMany({
    where: { code: { in: LEGACY_PAYMENT_CODES } },
    data: { isActive: false },
  });
  await prisma.payoutBank.updateMany({
    where: { code: { in: LEGACY_PAYOUT_CODES } },
    data: { isActive: false },
  });

  // 2. PAYMENT CHANNELS — from Xendit CSV (Indonesia only)
  const paymentCsv = readSeedCsv('payment_chanel_xendit.csv');
  const idPaymentRows = paymentCsv.rows.filter((row) => row.Country === 'ID');
  let paymentCount = 0;
  const usedPaymentNames = new Set();

  for (const row of idPaymentRows) {
    const code = row['Channel Code']?.trim();
    let name = row['Display Name']?.trim();
    if (!code || !name) continue;

    if (usedPaymentNames.has(name)) {
      name = `${name} (${code})`;
    }
    usedPaymentNames.add(name);

    const group = mapPaymentTypeToGroup(row.Type);
    const minAmount = parseAmount(row['Min Amount']);
    const maxAmount = parseAmount(row['Max Amount']);

    await prisma.paymentChannel.upsert({
      where: { code },
      update: {
        name,
        group,
        country: row.Country || 'ID',
        currency: row.Currency || 'IDR',
        minAmount,
        maxAmount,
        settlementTime: row['Settlement Time'] || null,
        xenditType: row.Type || null,
        isActive: true,
      },
      create: {
        name,
        code,
        group,
        country: row.Country || 'ID',
        currency: row.Currency || 'IDR',
        minAmount,
        maxAmount,
        settlementTime: row['Settlement Time'] || null,
        xenditType: row.Type || null,
        isActive: true,
      },
    });
    paymentCount++;
  }

  // 3. PAYOUT BANKS — from Xendit Indonesia CSV
  const payoutCsv = readSeedCsv('Payout_chanel_Indonesia.csv');
  let payoutCount = 0;

  for (const row of payoutCsv.rows) {
    const code = row['Channel code']?.trim();
    const name = row['Channel name']?.trim();
    if (!code || !name) continue;

    const minAmount = parseAmount(row['Min amount']);
    const maxAmount = parseAmount(row['Max amount']);

    await prisma.payoutBank.upsert({
      where: { code },
      update: {
        name,
        channelType: mapPayoutChannelType(row['Channel type']),
        country: row.Country === 'Indonesia' ? 'ID' : row.Country || 'ID',
        currency: row.Currencies || 'IDR',
        minAmount,
        maxAmount,
        flightTime: row['Flight time'] || null,
        isActive: true,
      },
      create: {
        name,
        code,
        channelType: mapPayoutChannelType(row['Channel type']),
        country: row.Country === 'Indonesia' ? 'ID' : row.Country || 'ID',
        currency: row.Currencies || 'IDR',
        minAmount,
        maxAmount,
        flightTime: row['Flight time'] || null,
        isActive: true,
      },
    });
    payoutCount++;
  }

  // 4. PLATFORM BANK ACCOUNT (Xendit code: MANDIRI)
  const mandiri = await prisma.paymentChannel.findUnique({ where: { code: 'MANDIRI' } });
  if (mandiri) {
    await prisma.platformBankAccount.upsert({
      where: { id: 'default-platform-bank' },
      update: { paymentChannelId: mandiri.id },
      create: {
        id: 'default-platform-bank',
        paymentChannelId: mandiri.id,
        accountNumber: '889012345678',
        accountName: 'PT BISA EKOSISTEM INDONESIA',
      },
    });
  }

  logger.info(
    `✅ [03] Financial seeded: ${fees.length} fees, ${paymentCount} payment channels (ID), ${payoutCount} payout channels.`,
  );
}
