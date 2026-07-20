import prisma from '#db';
import { seedBisaExpress } from '../prisma/seed/24-bisa-express.seeder.js';

async function main() {
  await seedBisaExpress(prisma);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
