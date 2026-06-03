import logger from '../../src/config/logger.js';
import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker/locale/id_ID';
import { avatarSeedPath } from '../../src/utils/loremFlickrMedia.util.ts';

export async function seedUsers(prisma) {
  logger.info('🌱 [04] Seeding BISA Elite Users (PRO Tiers)...');

  const passwordHash = await bcrypt.hash('password123', 10);
  // Get Geographic references
  const country = await prisma.country.findFirst();
  const province = await prisma.province.findFirst();

  if (!country) throw new Error('Need at least 1 Country from taxonomies seeder.');

  const proExpiresAt = new Date();
  proExpiresAt.setFullYear(proExpiresAt.getFullYear() + 1);
  const proSubscription = { tier: 'PRO', subscriptionExpiresAt: proExpiresAt };
  const createEliteAddress = async (fullAddress) => {
    const addr = await prisma.address.create({
      data: {
        countryId: country.id,
        provinceId: province?.id,
        fullAddress,
        zipCode: '60111',
        latitude: -7.2575,
        longitude: 112.7521,
      },
    });
    // Create Partner record for this address
    await prisma.partner.create({ data: { addressId: addr.id } });
    return addr;
  };

  // 1. ADMIN
  await prisma.user.upsert({
    where: { email: 'admin@bisaes.com' },
    update: { avatarUrl: avatarSeedPath(101) },
    create: {
      email: 'admin@bisaes.com',
      fullName: 'Super Admin',
      password: passwordHash,
      role: 'ADMIN',
      isEmailVerified: true,
      avatarUrl: avatarSeedPath(101),
    },
  });

  // 2. THE "PRO" BUYER (Hendra Wijaya from Screenshot)
  const HendraAddr = await createEliteAddress('Surabaya Industrial Hub, Central Block A-12');
  const hendra = await prisma.user.upsert({
    where: { email: 'h.wijaya@surabayaindustrial.com' },
    update: { ...proSubscription, avatarUrl: avatarSeedPath(102) },
    create: {
      email: 'h.wijaya@surabayaindustrial.com',
      fullName: 'Hendra Wijaya',
      avatarUrl: avatarSeedPath(102),
      phone: '+6281234567890',
      password: passwordHash,
      role: 'BUYER',
      tier: 'PRO',
      subscriptionExpiresAt: proExpiresAt,
      jobTitle: 'Procurement Manager',
      preferredLanguage: 'Bahasa Indonesia',
      isEmailVerified: true,
      addressId: HendraAddr.id,
      profile: {
        create: {
          companyName: 'Surabaya Industrial Hub',
          businessType: 'B2B Procurement',
          addressId: HendraAddr.id,
          npwp: '01.234.567.8-901.000',
        },
      },
    },
  });

  // 3. THE "PRO" SUPPLIER (Siti Aminah from Screenshot)
  const sitiAddr = await createEliteAddress('Taman Tekno Industrial Park, Blok B-5, Serpong');
  const siti = await prisma.user.upsert({
    where: { email: 'siti.aminah@agritech.com' },
    update: { ...proSubscription, avatarUrl: avatarSeedPath(103) },
    create: {
      email: 'siti.aminah@agritech.com',
      fullName: 'Siti Aminah',
      avatarUrl: avatarSeedPath(103),
      phone: '+628998877665',
      password: passwordHash,
      role: 'SUPPLIER',
      tier: 'PRO',
      subscriptionExpiresAt: proExpiresAt,
      jobTitle: 'Hardware Engineer',
      isEmailVerified: true,
      addressId: sitiAddr.id,
      profile: {
        create: {
          companyName: 'AgriTech Solutions',
          businessType: 'IoT & Biomass Hardware',
          addressId: sitiAddr.id,
        },
      },
    },
  });

  // 4. THE PREMIUM SELLER (Green Earth Co. from Screenshot)
  const greenAddr = await createEliteAddress('Green Green Business Park, Jakarta');
  const green = await prisma.user.upsert({
    where: { email: 'hello@greenearth.co' },
    update: { ...proSubscription, avatarUrl: avatarSeedPath(104) },
    create: {
      email: 'hello@greenearth.co',
      fullName: 'Green Earth Co.',
      avatarUrl: avatarSeedPath(104),
      phone: '+628111222333',
      password: passwordHash,
      role: 'SUPPLIER',
      tier: 'PRO',
      subscriptionExpiresAt: proExpiresAt,
      isEmailVerified: true,
      addressId: greenAddr.id,
      profile: {
        create: {
          companyName: 'Green Earth Co.',
          businessType: 'Premium Biochar Producer',
          addressId: greenAddr.id,
        },
      },
    },
  });

  // 5. BULK FREE USERS (To fill the gap)
  for (let i = 0; i < 5; i++) {
    const dummyAddr = await createEliteAddress(faker.location.streetAddress());
    await prisma.user.create({
      data: {
        email: faker.internet.email(),
        fullName: faker.person.fullName(),
        password: passwordHash,
        role: i % 2 === 0 ? 'BUYER' : 'SUPPLIER',
        tier: 'FREE',
        addressId: dummyAddr.id,
        avatarUrl: avatarSeedPath(200 + i),
      },
    });
  }

  // 5b. Avatar untuk semua user lain (supplier/buyer bulk dari seeder lain)
  let avatarLock = 500;
  const usersWithoutAvatar = await prisma.user.findMany({
    where: { OR: [{ avatarUrl: null }, { avatarUrl: '' }] },
    select: { id: true },
  });
  for (const u of usersWithoutAvatar) {
    await prisma.user.update({
      where: { id: u.id },
      data: { avatarUrl: avatarSeedPath(avatarLock++) },
    });
  }
  if (usersWithoutAvatar.length > 0) {
    logger.info(`✅ [04] Avatar seed: ${usersWithoutAvatar.length} user(s).`);
  }

  // 6. SEED USER RELATIONS (OperatingHours, PayoutAccounts, Documents, Tokens)
  const allUsers = await prisma.user.findMany();
  const selectedBank = await prisma.payoutBank.findFirst();

  for (const user of allUsers) {
    // 6a. Operating Hours (For Suppliers)
    if (user.role === 'SUPPLIER') {
      for (let day = 1; day <= 5; day++) {
        await prisma.operatingHour.upsert({
          where: { userId_dayOfWeek: { userId: user.id, dayOfWeek: day } },
          update: {},
          create: { userId: user.id, dayOfWeek: day, openTime: '08:00', closeTime: '17:00' },
        });
      }
    }

    // 6b. Payout Accounts
    if (selectedBank) {
      await prisma.userPayoutAccount.upsert({
        where: {
          userId_accountNumber_bankId: {
            userId: user.id,
            accountNumber: faker.finance.accountNumber(),
            bankId: selectedBank.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          bankId: selectedBank.id,
          accountNumber: faker.finance.accountNumber(),
          accountName: user.fullName,
          isMain: true,
        },
      });
    }

    // 6c. User Documents
    await prisma.userDocument.createMany({
      data: [
        {
          userId: user.id,
          title: 'KTP_Verification.pdf',
          fileUrl: 'https://bisa.es/docs/identity.pdf',
          fileType: 'IDENTITY',
          fileSize: '1.2 MB',
        },
        {
          userId: user.id,
          title: 'Tax_ID_NPWP.pdf',
          fileUrl: 'https://bisa.es/docs/tax.pdf',
          fileType: 'TAX_REPORT',
          fileSize: '0.8 MB',
        },
      ],
    });

    // 6d. Tokens (Sample)
    await prisma.token.create({
      data: {
        userId: user.id,
        token: faker.string.uuid(),
        type: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // 6e. Customer Addresses (Additional locations)
    const extraAddr = await createEliteAddress(faker.location.streetAddress());
    await prisma.customerAddress.create({
      data: {
        userId: user.id,
        addressId: extraAddr.id,
        label: faker.helpers.arrayElement(['Gudang Utama', 'Kantor Cabang', 'Workshop']),
      },
    });

    // 6f. Company Profile (Linked via Address)
    if (user.addressId) {
      await prisma.companyProfile.upsert({
        where: { addressId: user.addressId },
        update: {},
        create: { addressId: user.addressId },
      });
    }
  }

  // Get all users for other seeders
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const allSuppliers = await prisma.user.findMany({ where: { role: 'SUPPLIER' } });
  const allBuyers = await prisma.user.findMany({ where: { role: 'BUYER' } });

  // Pastikan semua akun PRO punya tanggal langganan aktif (wajib untuk IoT & fitur premium)
  const proUsersPatched = await prisma.user.updateMany({
    where: {
      tier: 'PRO',
      OR: [{ subscriptionExpiresAt: null }, { subscriptionExpiresAt: { lt: new Date() } }],
    },
    data: proSubscription,
  });
  if (proUsersPatched.count > 0) {
    logger.info(
      `✅ [04] ${proUsersPatched.count} akun PRO diperbarui dengan subscriptionExpiresAt (+1 tahun).`,
    );
  }

  // Dompet demo supplier — saldo siap tarik untuk uji payout
  const demoWalletBalance = 25_000_000;
  const demoSuppliers = [
    { user: siti, accountNo: '1234567890', accountName: 'Siti Aminah' },
    { user: green, accountNo: '9876543210', accountName: 'Green Earth Co.' },
  ].filter((entry) => entry.user);

  const bcaPayout = await prisma.payoutBank.findFirst({ where: { code: 'ID_BCA' } });

  for (const { user, accountNo, accountName } of demoSuppliers) {
    await prisma.wallet.upsert({
      where: { userId: user.id },
      update: {
        balance: demoWalletBalance,
        totalEarned: demoWalletBalance,
        totalWithdrawn: 0,
      },
      create: {
        userId: user.id,
        balance: demoWalletBalance,
        totalEarned: demoWalletBalance,
        totalWithdrawn: 0,
      },
    });

    if (bcaPayout) {
      await prisma.userPayoutAccount.updateMany({
        where: { userId: user.id },
        data: { isMain: false },
      });
      await prisma.userPayoutAccount.upsert({
        where: {
          userId_accountNumber_bankId: {
            userId: user.id,
            accountNumber: accountNo,
            bankId: bcaPayout.id,
          },
        },
        update: { accountName, isMain: true },
        create: {
          userId: user.id,
          bankId: bcaPayout.id,
          accountNumber: accountNo,
          accountName,
          isMain: true,
        },
      });
    }
  }

  if (demoSuppliers.length > 0) {
    logger.info(
      `✅ [04] Dompet demo supplier: saldo Rp ${demoWalletBalance.toLocaleString('id-ID')} (siti & green).`,
    );
  }

  logger.info('✅ [04] Elite Users (PRO & FREE) with Full Profiles & Ops seeded.');
  return { admin, hendra, siti, green, allSuppliers, allBuyers };
}
