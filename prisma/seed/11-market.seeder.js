import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import logger from '#config/logger';
import { TrendType, TrendCategory } from '#prisma';

const bundlePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/market_seed_bundles.json',
);

const loadBundle = () => {
  const raw = readFileSync(bundlePath, 'utf-8');
  return JSON.parse(raw);
};

/**
 * Seed Market Trends — historis 50 bulan (2022–2026) per komoditas BISA.
 * Regenerate: python ml-bisa/scripts/build_market_seed_bundles.py
 */
export const seedMarket = async (prisma) => {
  logger.info('📈 Seeding Market Trends (expanded bundle)...');

  const bundle = loadBundle();
  const trends = bundle.commodities ?? [];

  // Hapus trend faker lama (Trend Concrete Kendal, dll.)
  await prisma.marketTrend.deleteMany({
    where: { label: { startsWith: 'Trend ' } },
  });

  for (const t of trends) {
    const category = TrendCategory[t.category] ?? TrendCategory.BIOMASSA;
    const trendType = TrendType[t.trendType] ?? TrendType.STABLE;

    const existing = await prisma.marketTrend.findFirst({
      where: { label: t.label },
    });

    const data = {
      currentValue: t.currentValue,
      trendType,
      category,
      historyData: t.historyData,
    };

    if (existing) {
      await prisma.marketTrend.update({ where: { id: existing.id }, data });
    } else {
      await prisma.marketTrend.create({ data: { label: t.label, ...data } });
    }
  }

  // Volume panen / limbah biomassa untuk analitik GIS
  const harvestRows = bundle.harvestWaste ?? [];
  if (harvestRows.length > 0) {
    await prisma.wasteData.deleteMany({
      where: { source: { contains: 'BPS' } },
    });
    for (const row of harvestRows) {
      await prisma.wasteData.create({
        data: {
          province: row.province,
          regency: row.regency,
          biomassaType: row.biomassaType,
          volumeTon: row.volumeTon,
          year: row.year,
          source: row.source,
        },
      });
    }
    logger.info(`   ↳ ${harvestRows.length} baris data panen/limbah biomassa`);
  }

  logger.info(`✅ Market Trends seed completed (${trends.length} komoditas, ${bundle.periodRange?.months ?? '?'} bulan)!`);
};
