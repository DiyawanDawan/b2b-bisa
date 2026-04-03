import logger from '#config/logger';

export async function seedCMS(prisma) {
  logger.info('🌱 Seeding CMS Data...');

  // 1. Platform Settings
  const settings = [
    {
      key: 'about_hero_headline',
      value: 'Solusi Ekosistem Biochar & Biomassa B2B Terbesar di Indonesia',
      group: 'ABOUT_HERO',
    },
    {
      key: 'about_hero_subheadline',
      value: 'Menghubungkan Ribuan Petani & Pabrik untuk Masa Depan Bebas Karbon',
      group: 'ABOUT_HERO',
    },
    { key: 'global_contact_email', value: 'b2b@bisaes.com', group: 'GLOBAL' },
  ];

  for (const s of settings) {
    await prisma.platformSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  // 2. FAQs
  const faqs = [
    {
      question: 'Bagaimana cara bergabung sebagai Supplier?',
      answer:
        'Anda perlu membuat akun Supplier, mengunggah dokumen legalitas (NIB/SIUP), dan menunggu verifikasi Admin.',
      group: 'FAQ_SUPPLIER',
    },
    {
      question: 'Apakah pembayaran Escrow aman?',
      answer:
        'Ya, dana Anda akan ditahan oleh sistem pihak ketiga (Xendit) hingga barang diterima sesuai dengan spesifikasi yang disepakati.',
      group: 'FAQ_BUYER',
    },
  ];

  for (const faq of faqs) {
    // FAQ doesnt have unique string key, so we create if we dont have many FAQs
    const exists = await prisma.faq.findFirst({ where: { question: faq.question } });
    if (!exists) {
      await prisma.faq.create({ data: faq });
    }
  }

  // 3. Impact Metrics
  const metrics = [
    {
      label: 'CO2 Sequestration',
      value: '25.4k',
      sublabel: 'Ton CO2 Tahunan',
      unit: 'Ton',
      change: '+12%',
      isPrimary: true,
      group: 'HERO_LIVE',
    },
    {
      label: 'Active Suppliers',
      value: '1,200+',
      sublabel: 'Pabrik & Kelompok Tani',
      unit: 'Entitas',
      change: '+5%',
      isPrimary: false,
      group: 'HERO_LIVE',
    },
  ];

  for (const metric of metrics) {
    const exists = await prisma.impactMetric.findFirst({ where: { label: metric.label } });
    if (!exists) {
      await prisma.impactMetric.create({ data: metric });
    }
  }

  logger.info('✅ CMS Data seeded successfully.');
}
