import prisma from '#db';

const INTERNAL_PREFIXES = ['_', '$', 'constructor'];

async function main() {
  console.log('🔍 Memeriksa tabel yang kosong (belum ada data)...\n');

  const allKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(prisma)).concat(
    Object.keys(prisma),
  );
  const seen = new Set<string>();
  const results: { model: string; count: number }[] = [];

  for (const key of allKeys.sort()) {
    if (seen.has(key)) continue;
    seen.add(key);

    if (INTERNAL_PREFIXES.some((p) => key.startsWith(p))) continue;

    try {
      if (typeof (prisma as any)[key]?.count !== 'function') continue;
      const count = await (prisma as any)[key].count();
      results.push({ model: key, count });
    } catch (err: any) {
      console.log(`  ⚠️  ${key}: ERROR - ${err.message?.split('\n')[0]}`);
      continue;
    }
  }

  results.sort((a, b) => a.count - b.count);

  console.log(`Model                                  Count`);
  console.log('─'.repeat(60));

  for (const { model, count } of results) {
    const status = count === 0 ? '❌ KOSONG' : '✅';
    const modelPadded = model.padEnd(36);
    console.log(`  ${modelPadded} ${status} (${count} rec)`);
  }

  console.log('─'.repeat(60));

  const emptyModels = results.filter((r) => r.count === 0);
  const filledModels = results.filter((r) => r.count > 0);

  console.log(`\n  Total model: ${results.length}`);
  console.log(`  Tabel terisi: ${filledModels.length}`);
  console.log(`  Tabel KOSONG: ${emptyModels.length}`);

  if (emptyModels.length > 0) {
    console.log(`\n  🚨 Tabel yang BELUM punya data:`);
    for (const { model } of emptyModels) console.log(`     - ${model}`);
  } else {
    console.log(`\n  🎉 Semua tabel sudah terisi data!`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ Gagal:', e);
  await prisma.$disconnect();
  process.exit(1);
});
