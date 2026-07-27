import prisma from '../src/config/prisma';
import logger from '../src/config/logger';

async function backfillUserProfiles() {
  const usersWithoutProfile = await prisma.user.findMany({
    where: { profile: null },
    select: { id: true, email: true, fullName: true, role: true, phone: true },
  });

  if (!usersWithoutProfile.length) {
    logger.info('Semua user sudah punya profile.');
    return;
  }

  logger.info(`Backfill profile untuk ${usersWithoutProfile.length} user...`);

  const companyPrefix = {
    SUPPLIER: ['PT', 'CV', 'UD'],
    BUYER: ['PT', 'CV'],
    ADMIN: ['PT BISA'],
    COURIER: ['Ekspedisi'],
  };

  let n = 0;
  for (const user of usersWithoutProfile) {
    const prefix = (companyPrefix[user.role] || ['PT'])[n % 3];
    const name = user.fullName || user.email?.split('@')[0] || 'User';
    const company = `${prefix} ${name
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .split(' ')
      .slice(0, 2)
      .join(' ')}`;

    try {
      await prisma.userProfile.create({
        data: {
          userId: user.id,
          companyName: company,
          position:
            user.role === 'SUPPLIER'
              ? 'Direktur'
              : user.role === 'BUYER'
                ? 'Procurement Manager'
                : 'Staff',
          industry:
            user.role === 'SUPPLIER'
              ? 'Pertanian & Biomassa'
              : user.role === 'COURIER'
                ? 'Logistik'
                : 'Umum',
          bio: `${company} — platform B2B biomassa & produk organik.`,
          website: `https://${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.id`,
          employeeCount: 10 + (n % 50) * 5,
          foundedYear: 2000 + (n % 24),
        },
      });
      n++;
    } catch (e) {
      // skip duplicate
    }
  }

  logger.info(`✅ ${n} user_profile ditambahkan.`);
}

async function main() {
  logger.info('🔧 [PROFILE-BACKFILL] ...\n');
  await backfillUserProfiles();
  await prisma.$disconnect();
}

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
