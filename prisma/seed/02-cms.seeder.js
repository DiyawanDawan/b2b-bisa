import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';

export async function seedCMS(prisma) {
  logger.info('🌱 [02] Seeding Elite CMS Hierarchy & Navigation...');

  // CLEANUP: Delete existing CMS data to avoid unique constraint violations
  await prisma.platformSetting.deleteMany({});
  await prisma.cmsMenuItem.deleteMany({});
  await prisma.cmsMenu.deleteMany({});
  await prisma.faq.deleteMany({});
  await prisma.policy.deleteMany({});
  await prisma.contentCard.deleteMany({});
  await prisma.teamMember.deleteMany({});
  await prisma.impactMetric.deleteMany({});
  await prisma.cmsSection.deleteMany({});
  await prisma.cmsPage.deleteMany({});

  // 1. CREATE PAGES
  const pages = [
    {
      slug: 'home',
      title: 'Home Page',
      metaTitle: 'Biochar Indonesia (BISA) - Precision Ecology',
      metaDescription: 'Pioneering circular economy for soil health and carbon sequestration.',
    },
    {
      slug: 'marketplace',
      title: 'Biochar Marketplace',
      metaTitle: 'Beli Biochar Terpercaya | BISA B2B',
      metaDescription: 'Marketplace biochar terbesar di Indonesia dengan jaminan kualitas AI.',
    },
    {
      slug: 'forum',
      title: 'Community & Forum',
      metaTitle: 'Biochar Community Indonesia',
      metaDescription: 'Berbagi ilmu seputar teknologi pirolisis dan regenerasi tanah.',
    },
    {
      slug: 'dashboard',
      title: 'User Dashboard',
      metaTitle: 'BISA Dashboard - Analytics & Compliance',
    },
  ];

  const pageMap = {};
  for (const p of pages) {
    const createdPage = await prisma.cmsPage.upsert({
      where: { slug: p.slug },
      update: {},
      create: p,
    });
    pageMap[p.slug] = createdPage.id;
  }

  // 2. CREATE SECTIONS FOR HOME PAGE
  const homeSections = [
    { pageId: pageMap['home'], name: 'Hero Section', type: 'HERO', order: 0 },
    { pageId: pageMap['home'], name: 'Impact Architecture', type: 'METRICS', order: 1 },
    { pageId: pageMap['home'], name: 'The Crisis of Degradation', type: 'GRID', order: 2 },
    { pageId: pageMap['home'], name: 'The Architects of BISA', type: 'TEAM', order: 3 },
    { pageId: pageMap['home'], name: 'Frequently Asked Questions', type: 'FAQ', order: 4 },
  ];

  const sectionMap = {};
  for (const s of homeSections) {
    const createdSection = await prisma.cmsSection.create({
      data: s,
    });
    sectionMap[s.name] = createdSection.id;
  }

  // 3. SEED SETTINGS (HERO SECTION)
  const heroId = sectionMap['Hero Section'];
  await prisma.platformSetting.createMany({
    data: [
      { sectionId: heroId, key: 'hero_headline', value: 'Precision Ecology for a Circular Future' },
      {
        sectionId: heroId,
        key: 'hero_subheadline',
        value:
          'Pioneering the synthesis of biological wisdom and technological intelligence for soil health.',
      },
      { sectionId: heroId, key: 'hero_primary_cta', value: 'Explore Impact' },
      { sectionId: heroId, key: 'hero_secondary_cta', value: 'Our Ecosystem' },
      {
        sectionId: heroId,
        key: 'hero_bg_image',
        value:
          'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?q=80&w=2070&auto=format&fit=crop',
      },
    ],
  });

  // 4. SEED IMPACT METRICS (Exactly from UI)
  const metricsId = sectionMap['Impact Architecture'];
  await prisma.impactMetric.createMany({
    data: [
      {
        sectionId: metricsId,
        label: 'Annual CO2 absorption',
        value: '20.4k Tons',
        sublabel: 'Annual CO2 absorption through systematic biochar soil integration.',
        unit: 'Tons',
        isPrimary: true,
      },
      {
        sectionId: metricsId,
        label: 'Biochar Value',
        value: 'Rp10.5B',
        sublabel: 'Total Biochar Value generated.',
        unit: 'IDR',
        isPrimary: false,
      },
      {
        sectionId: metricsId,
        label: 'Waste Managed',
        value: '10k',
        sublabel: 'Total biomass waste managed.',
        unit: 'Tons',
        isPrimary: false,
      },
      {
        sectionId: metricsId,
        label: 'Regenerative Jobs',
        value: '100+',
        sublabel: 'New regenerative green jobs created.',
        unit: 'Jobs',
        isPrimary: false,
      },
    ],
  });

  // 5. SEED TEAM (Architects)
  const teamId = sectionMap['The Architects of BISA'];
  const architects = [
    { name: 'Gajahran', role: 'S.S. Grants & Partner', location: 'Lombok Tengah' },
    { name: 'Ijal', role: 'AI Specialist', location: 'Mataram' },
    { name: 'Gunawan Rahadi', role: 'Field Ecosystem', location: 'Lombok Timur' },
    { name: 'Bayu Winata', role: 'Backend Engineer', location: 'Lampung' },
  ];
  for (const a of architects) {
    await prisma.teamMember.create({
      data: {
        sectionId: teamId,
        ...a,
        imageUrl: faker.image.urlLoremFlickr({ category: 'people', width: 400, height: 400 }),
      },
    });
  }

  // 6. CREATE MENUS (Main Nav & Dashboard Sub-Nav)
  const mainMenu = await prisma.cmsMenu.create({
    data: { name: 'Main Navigation', platform: 'WEB' },
  });

  const mainItems = [
    { label: 'Marketplace', link: '/marketplace', order: 0 },
    { label: 'GIS Insights', link: '/gis', order: 1 },
    { label: 'Impact', link: '/impact', order: 2 },
    { label: 'Forum', link: '/forum', order: 3 },
    { label: 'About', link: '/about', order: 4 },
  ];

  for (const item of mainItems) {
    await prisma.cmsMenuItem.create({
      data: { menuId: mainMenu.id, ...item },
    });
  }

  const dashMenu = await prisma.cmsMenu.create({
    data: { name: 'Dashboard Menu', platform: 'WEB' },
  });

  const dashItems = [
    { label: 'Dashboard', link: '/dashboard', order: 0, icon: 'LayoutDashboard' },
    { label: 'Orders', link: '/orders', order: 1, icon: 'ShoppingBag' },
    { label: 'Financials', link: '/financials', order: 2, icon: 'Wallet' },
    { label: 'Logistics', link: '/logistics', order: 3, icon: 'Truck' },
    { label: 'Mitra Chat', link: '/chat', order: 4, icon: 'MessageSquare' },
  ];

  for (const item of dashItems) {
    await prisma.cmsMenuItem.create({
      data: { menuId: dashMenu.id, ...item },
    });
  }

  // 7. SEED FAQs (For Home FAQ Section)
  const faqId = sectionMap['Frequently Asked Questions'];
  await prisma.faq.createMany({
    data: [
      {
        sectionId: faqId,
        question: 'Apa itu Biochar?',
        answer:
          'Biochar adalah arang hasil pirolisis biomassa yang digunakan untuk memperbaiki kesuburan tanah dan penyerapan karbon.',
        order: 0,
      },
      {
        sectionId: faqId,
        question: 'Bagaimana cara kerja BISA B2B?',
        answer:
          'BISA menghubungkan penyedia biomassa dengan pembeli industri melalui sistem escrow yang aman dan pemantauan IoT.',
        order: 1,
      },
      {
        sectionId: faqId,
        question: 'Apakah transaksi di BISA aman?',
        answer:
          'Ya, semua transaksi dilindungi oleh sistem escrow BISA dimana pembayaran hanya diteruskan setelah barang diterima.',
        order: 2,
      },
      {
        sectionId: faqId,
        question: 'Bagaimana cara menjadi supplier di BISA?',
        answer:
          'Anda dapat mendaftar melalui halaman registrasi, melengkapi profil bisnis, dan mengunggah dokumen verifikasi seperti NIB.',
        order: 3,
      },
      {
        sectionId: faqId,
        question: 'Apa kelebihan biochar BISA?',
        answer:
          'Biochar kami dipantau dengan IoT untuk memastikan suhu pirolisis optimal, menghasilkan kemurnian karbon tinggi (>80%).',
        order: 4,
      },
      {
        sectionId: faqId,
        question: 'Jenis biomassa apa saja yang diterima?',
        answer:
          'Kami menerima sekam padi, tongkol jagung, tempurung kelapa, dan limbah kayu yang sudah dikeringkan.',
        order: 5,
      },
      {
        sectionId: faqId,
        question: 'Bagaimana sistem pengiriman barang?',
        answer:
          'BISA bekerja sama dengan mitra logistik industri untuk pengiriman skala besar menggunakan armada truk cargo terverifikasi.',
        order: 6,
      },
      {
        sectionId: faqId,
        question: 'Apakah ada biaya platform?',
        answer:
          'BISA mengenakan biaya layanan sebesar 3% dari total transaksi untuk pemeliharaan sistem escrow dan pemantauan IoT.',
        order: 7,
      },
      {
        sectionId: faqId,
        question: 'Apa itu fitur Carbon Offset?',
        answer:
          'Fitur ini menghitung kontribusi penyerapan CO2 dari setiap ton biochar yang diaplikasikan ke lahan pertanian.',
        order: 8,
      },
      {
        sectionId: faqId,
        question: 'Bagaimana jika barang tidak sesuai spek?',
        answer:
          'Buyer dapat mengajukan komplain melalui sistem sengketa sebelum dana escrow dilepaskan ke supplier.',
        order: 9,
      },
    ],
  });

  // 8. SEED CONTENT CARDS (For "The Crisis of Degradation" GRID)
  const gridId = sectionMap['The Crisis of Degradation'];
  await prisma.contentCard.createMany({
    data: [
      {
        sectionId: gridId,
        title: 'Soil Depletion',
        description:
          'Tanah kehilangan nutrisi akibat penggunaan bahan kimia berlebihan selama dekade terakhir.',
        icon: 'AlertTriangle',
        order: 0,
      },
      {
        sectionId: gridId,
        title: 'Carbon Emission',
        description:
          'Limbah biomassa yang tidak terkelola menghasilkan emisi metana yang berbahaya bagi atmosfer.',
        icon: 'CloudRain',
        order: 1,
      },
      {
        sectionId: gridId,
        title: 'Economic Loss',
        description:
          'Penurunan hasil panen menyebabkan kerugian ekonomi signifikan bagi komunitas petani lokal.',
        icon: 'TrendingDown',
        order: 2,
      },
    ],
  });

  // 9. SEED POLICIES
  await prisma.policy.createMany({
    data: [
      {
        title: 'Privacy Policy',
        content:
          'Kebijakan privasi BISA menjelaskan bagaimana kami menangani data Anda secara aman.',
        version: '1.0.0',
      },
      {
        title: 'Terms of Service',
        content: 'Syarat dan ketentuan penggunaan platform BISA untuk supplier dan buyer.',
        version: '1.0.0',
      },
      {
        title: 'Refund Policy',
        content: 'Aturan pengembalian dana jika terjadi sengketa dalam transaksi.',
        version: '1.0.0',
      },
    ],
  });

  logger.info('✅ [02] Full Elite CMS Seeding Complete.');
}
