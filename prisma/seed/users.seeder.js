import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

export async function seedUsers(prisma) {
  console.log('🌱 Seeding Users...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Admin
  await prisma.user.upsert({
    where: { email: 'admin@bisaes.com' },
    update: {},
    create: {
      email: 'admin@bisaes.com',
      fullName: 'Super Admin BISA',
      password: passwordHash,
      role: 'ADMIN',
      isEmailVerified: true,
      jobTitle: 'System Administrator',
    },
  });

  // 2. Supplier
  const supplier = await prisma.user.upsert({
    where: { email: 'supplier@bisaes.com' },
    update: {},
    create: {
      email: 'supplier@bisaes.com',
      fullName: 'PT Agro Biomassa Nusantara',
      password: passwordHash,
      role: 'SUPPLIER',
      isEmailVerified: true,
      jobTitle: 'Direktur Penjualan',
      region: 'Jawa Timur',
      wallet: {
        create: { balance: 0 },
      },
    },
  });

  // 3. Buyer
  await prisma.user.upsert({
    where: { email: 'buyer@industri.com' },
    update: {},
    create: {
      email: 'buyer@industri.com',
      fullName: 'PT Semen Go Green',
      password: passwordHash,
      role: 'BUYER',
      isEmailVerified: true,
      jobTitle: 'Procurement Specialist',
      region: 'Jawa Barat',
    },
  });

  console.log('✅ Users seeded successfully.');
  return supplier; // Return for product seeding
}
