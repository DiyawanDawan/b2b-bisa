import logger from '../../src/config/logger.js';

const FAQS = [
  {
    question: 'Bagaimana cara menjual produk biomassa?',
    answer:
      'Anda dapat mendaftar sebagai Supplier dan mengunggah dokumen verifikasi akun. Setelah akun terverifikasi, tambahkan produk melalui menu Manajemen Produk atau Tambah Produk.',
    order: 1,
    isActive: true,
  },
  {
    question: 'Apakah transaksi di BISA aman?',
    answer:
      'Ya, kami menggunakan sistem Escrow (Rekening Bersama) untuk menjamin keamanan transaksi antara pembeli dan supplier hingga pesanan selesai.',
    order: 2,
    isActive: true,
  },
  {
    question: 'Berapa lama proses verifikasi akun?',
    answer:
      'Proses verifikasi biasanya memakan waktu 1–3 hari kerja setelah dokumen lengkap dikirim melalui menu Verifikasi Akun.',
    order: 3,
    isActive: true,
  },
  {
    question: 'Bagaimana cara tarik saldo penghasilan?',
    answer:
      'Supplier dapat melakukan penarikan saldo melalui menu Dompet BISA ke rekening bank yang sudah terdaftar dan terverifikasi.',
    order: 4,
    isActive: true,
  },
];

export async function seedFaqs(prisma) {
  logger.info('🌱 [16] Seeding FAQ (Help Center)...');

  await prisma.faq.deleteMany({});

  for (const faq of FAQS) {
    await prisma.faq.create({ data: faq });
    logger.info(`   ✓ FAQ: ${faq.question.substring(0, 40)}...`);
  }

  logger.info('✅ [16] FAQ seeded.');
}
