import logger from '#config/logger';
import { TrendType, TrendCategory } from '#prisma';

/**
 * Seed Market Trends for Price Prediction Dashboard
 */
export const seedMarket = async (prisma) => {
  logger.info('📈 Seeding Market Trends...');

  const trends = [
    {
      label: 'Biochar Grade A Premium',
      currentValue: 'Rp 4.500/kg',
      trendType: TrendType.UP,
      category: TrendCategory.CARBON,
      historyData: [
        { x: '2023-01', y: 3800 },
        { x: '2023-02', y: 3900 },
        { x: '2023-03', y: 3950 },
        { x: '2023-04', y: 4000 },
        { x: '2023-05', y: 4100 },
        { x: '2023-06', y: 4050 },
        { x: '2023-07', y: 4200 },
        { x: '2023-08', y: 4250 },
        { x: '2023-09', y: 4300 },
        { x: '2023-10', y: 4400 },
        { x: '2023-11', y: 4450 },
        { x: '2023-12', y: 4500 },
      ],
    },
    {
      label: 'Sekam Padi Mentah',
      currentValue: 'Rp 800/kg',
      trendType: TrendType.STABLE,
      category: TrendCategory.BIOMASSA,
      historyData: [
        { x: '2023-01', y: 800 },
        { x: '2023-02', y: 820 },
        { x: '2023-03', y: 810 },
        { x: '2023-04', y: 790 },
        { x: '2023-05', y: 780 },
        { x: '2023-06', y: 800 },
        { x: '2023-07', y: 800 },
        { x: '2023-08', y: 810 },
        { x: '2023-09', y: 810 },
        { x: '2023-10', y: 800 },
        { x: '2023-11', y: 800 },
        { x: '2023-12', y: 800 },
      ],
    },
    {
      label: 'Kargo Truk (Jawa - Bali)',
      currentValue: 'Rp 3.500.000',
      trendType: TrendType.DOWN,
      category: TrendCategory.LOGISTICS,
      historyData: [
        { x: '2023-01', y: 4200000 },
        { x: '2023-02', y: 4150000 },
        { x: '2023-03', y: 4100000 },
        { x: '2023-04', y: 4500000 },
        { x: '2023-05', y: 4000000 },
        { x: '2023-06', y: 3900000 },
        { x: '2023-07', y: 3850000 },
        { x: '2023-08', y: 3800000 },
        { x: '2023-09', y: 3700000 },
        { x: '2023-10', y: 3600000 },
        { x: '2023-11', y: 3550000 },
        { x: '2023-12', y: 3500000 },
      ],
    },
  ];

  for (const t of trends) {
    const existing = await prisma.marketTrend.findFirst({
      where: { label: t.label },
    });

    if (existing) {
      await prisma.marketTrend.update({
        where: { id: existing.id },
        data: {
          currentValue: t.currentValue,
          trendType: t.trendType,
          category: t.category,
          historyData: t.historyData,
        },
      });
    } else {
      await prisma.marketTrend.create({
        data: {
          label: t.label,
          currentValue: t.currentValue,
          trendType: t.trendType,
          category: t.category,
          historyData: t.historyData,
        },
      });
    }
  }

  logger.log('✅ Market Trends seed completed!');
};
