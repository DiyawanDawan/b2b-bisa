import logger from '../../src/config/logger.js';
import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker/locale/id_ID';
import { avatarSeedPath } from '../../src/utils/loremFlickrMedia.util.ts';
import { encryptField } from '../../src/utils/encryption.util.ts';
import { sealAccountName, sealAccountNumber } from '../../src/utils/payoutAccount.util.ts';
import {
  sealAddress,
  sealAddressPhone,
  sealDocumentFile,
  sealDocumentTitle,
} from '../../src/utils/piiField.util.ts';
import { searchDomesticDestinations } from '../../src/services/rajaongkir.service.ts';

export async function seedUsers(prisma) {
  logger.info('🌱 [04] Seeding BISA Elite Users (PRO Tiers)...');

  const passwordHash = await bcrypt.hash('password123', 10);
  // Get Geographic references
  const country = await prisma.country.findFirst();
  const province = await prisma.province.findFirst();
  const regency = await prisma.regency.findFirst();
  const regencyProvince = regency
    ? await prisma.province.findUnique({ where: { id: regency.provinceId } })
    : null;
  const district = regency
    ? await prisma.district.findFirst({ where: { regencyId: regency.id } })
    : null;
  const village = district
    ? await prisma.village.findFirst({ where: { districtId: district.id } })
    : null;

  if (!country) throw new Error('Need at least 1 Country from taxonomies seeder.');
  if (!regency) throw new Error('Need at least 1 Regency from regions seeder.');

  const proExpiresAt = new Date();
  proExpiresAt.setFullYear(proExpiresAt.getFullYear() + 1);
  const proSubscription = { tier: 'PRO', subscriptionExpiresAt: proExpiresAt };

  const regProvinceId = regencyProvince?.id ?? province?.id;

  const createEliteAddress = async (fullAddress, phoneNumber, opts) => {
    const addr = await prisma.address.create({
      data: {
        countryId: country.id,
        provinceId: opts?.provinceId ?? regProvinceId,
        regencyId: opts?.regencyId ?? regency.id,
        districtId: opts?.districtId ?? district?.id ?? null,
        villageId: opts?.villageId ?? village?.id ?? null,
        fullAddress: sealAddress(fullAddress),
        zipCode: opts?.zipCode ?? '60111',
        phoneNumber: phoneNumber
          ? sealAddressPhone(phoneNumber)
          : sealAddressPhone('+6281234567890'),
        latitude: opts?.latitude ?? -7.2575,
        longitude: opts?.longitude ?? 112.7521,
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
  const HendraAddr = await createEliteAddress('Surabaya Industrial Hub, Central Block A-12', null, {
    provinceId: regProvinceId,
    regencyId: regency.id,
  });
  const hendra = await prisma.user.upsert({
    where: { email: 'h.wijaya@surabayaindustrial.com' },
    update: {
      ...proSubscription,
      avatarUrl: avatarSeedPath(102),
      regency: regency.name,
      province: regencyProvince?.name,
    },
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
      regency: regency.name,
      province: regencyProvince?.name,
      profile: {
        create: {
          companyName: 'Surabaya Industrial Hub',
          businessType: 'B2B Procurement',
          addressId: HendraAddr.id,
          npwp: encryptField('01.234.567.8-901.000'),
        },
      },
    },
  });

  // 3. THE "PRO" SUPPLIER (Siti Aminah from Screenshot)
  const sitiAddr = await createEliteAddress(
    'Taman Tekno Industrial Park, Blok B-5, Serpong',
    null,
    {
      provinceId: regProvinceId,
      regencyId: regency.id,
    },
  );

  // Cari rajaongkirOriginId dari API ongkir (safe — log warning kalau gagal)
  const sitiSearchQuery = regencyProvince?.name
    ? `${regency.name}, ${regencyProvince.name}`
    : `Kota ${regency.name}`;
  let sitiOriginId = null;
  let sitiOriginLabel = null;
  try {
    const sitiResults = await searchDomesticDestinations({ search: sitiSearchQuery, limit: 8 });
    if (sitiResults.length > 0) {
      const parsed = Number(sitiResults[0].id);
      if (!Number.isNaN(parsed) && parsed > 0) {
        sitiOriginId = parsed;
        sitiOriginLabel = sitiResults[0].label ?? regency.name;
      }
    }
  } catch (err) {
    logger.warn(
      `   ⚠️ RajaOngkir search gagal untuk Siti (${sitiSearchQuery}): ${err.message?.slice(0, 80)}`,
    );
  }

  const siti = await prisma.user.upsert({
    where: { email: 'siti.aminah@agritech.com' },
    update: {
      ...proSubscription,
      avatarUrl: avatarSeedPath(103),
      regency: regency.name,
      province: regencyProvince?.name,
    },
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
      regency: regency.name,
      province: regencyProvince?.name,
      profile: {
        create: {
          companyName: 'AgriTech Solutions',
          businessType: 'IoT & Biomass Hardware',
          addressId: sitiAddr.id,
          rajaongkirOriginId: sitiOriginId,
          rajaongkirOriginLabel: sitiOriginLabel,
        },
      },
    },
  });

  // 4. THE PREMIUM SELLER (Green Earth Co. from Screenshot)
  const greenAddr = await createEliteAddress('Green Green Business Park, Jakarta', null, {
    provinceId: regProvinceId,
    regencyId: regency.id,
  });

  const greenSearchQuery = regencyProvince?.name
    ? `${regency.name}, ${regencyProvince.name}`
    : `Kota ${regency.name}`;
  let greenOriginId = null;
  let greenOriginLabel = null;
  try {
    const greenResults = await searchDomesticDestinations({ search: greenSearchQuery, limit: 8 });
    if (greenResults.length > 0) {
      const parsed = Number(greenResults[0].id);
      if (!Number.isNaN(parsed) && parsed > 0) {
        greenOriginId = parsed;
        greenOriginLabel = greenResults[0].label ?? regency.name;
      }
    }
  } catch (err) {
    logger.warn(
      `   ⚠️ RajaOngkir search gagal untuk Green Earth (${greenSearchQuery}): ${err.message?.slice(0, 80)}`,
    );
  }

  const green = await prisma.user.upsert({
    where: { email: 'hello@greenearth.co' },
    update: {
      ...proSubscription,
      avatarUrl: avatarSeedPath(104),
      regency: regency.name,
      province: regencyProvince?.name,
    },
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
      regency: regency.name,
      province: regencyProvince?.name,
      profile: {
        create: {
          companyName: 'Green Earth Co.',
          businessType: 'Premium Biochar Producer',
          addressId: greenAddr.id,
          rajaongkirOriginId: greenOriginId,
          rajaongkirOriginLabel: greenOriginLabel,
        },
      },
    },
  });

  // 5. BULK FREE USERS (To fill the gap)
  for (let i = 0; i < 5; i++) {
    const isSupplier = i % 2 !== 0;
    const dummyAddr = await createEliteAddress(faker.location.streetAddress(), null, {
      provinceId: regProvinceId,
      regencyId: regency.id,
    });
    await prisma.user.create({
      data: {
        email: faker.internet.email(),
        fullName: faker.person.fullName(),
        password: passwordHash,
        role: isSupplier ? 'SUPPLIER' : 'BUYER',
        tier: 'FREE',
        addressId: dummyAddr.id,
        avatarUrl: avatarSeedPath(200 + i),
        regency: regency.name,
        province: regencyProvince?.name,
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

    // 6b. Payout Accounts (accountNumber sealed — matches production write-path)
    if (selectedBank) {
      const plainAccountNumber = faker.finance.accountNumber();
      const sealedAccountNumber = sealAccountNumber(plainAccountNumber, {
        userId: user.id,
        bankId: selectedBank.id,
      });
      await prisma.userPayoutAccount.upsert({
        where: {
          userId_accountNumber_bankId: {
            userId: user.id,
            accountNumber: sealedAccountNumber,
            bankId: selectedBank.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          bankId: selectedBank.id,
          accountNumber: sealedAccountNumber,
          accountName: sealAccountName(user.fullName),
          isMain: true,
        },
      });
    }

    // 6c. User Documents
    const docData = [
      {
        title: 'KTP_Verification.pdf',
        fileUrl: 'https://bisa.es/docs/identity.pdf',
        fileType: 'IDENTITY',
        fileSize: '1.2 MB',
      },
      {
        title: 'Tax_ID_NPWP.pdf',
        fileUrl: 'https://bisa.es/docs/tax.pdf',
        fileType: 'TAX_REPORT',
        fileSize: '0.8 MB',
      },
    ];
    for (const doc of docData) {
      await prisma.userDocument.create({
        data: {
          userId: user.id,
          title: sealDocumentTitle(doc.title),
          fileUrl: sealDocumentFile(doc.fileUrl),
          fileType: doc.fileType,
          fileSize: doc.fileSize,
        },
      });
    }

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
    const extraAddr = await createEliteAddress(faker.location.streetAddress(), '+6281234567890', {
      provinceId: regProvinceId,
      regencyId: regency.id,
    });
    await prisma.customerAddress.create({
      data: {
        userId: user.id,
        addressId: extraAddr.id,
        label: faker.helpers.arrayElement(['Gudang Utama', 'Kantor Cabang', 'Workshop']),
        rajaongkirDestinationId: 444,
        rajaongkirDestinationLabel: `${regency.name}, ${regencyProvince?.name ?? ''}`,
        isPrimary: true,
      },
    });

    // 6f. Company Profile (Linked via Address)
    if (user.addressId) {
      try {
        await prisma.companyProfile.upsert({
          where: { addressId: user.addressId },
          update: {},
          create: { addressId: user.addressId },
        });
      } catch {
        // table mungkin belum ada / migration belum jalan
      }
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
      const sealedAccountNo = sealAccountNumber(accountNo, {
        userId: user.id,
        bankId: bcaPayout.id,
      });
      await prisma.userPayoutAccount.updateMany({
        where: { userId: user.id },
        data: { isMain: false },
      });
      await prisma.userPayoutAccount.upsert({
        where: {
          userId_accountNumber_bankId: {
            userId: user.id,
            accountNumber: sealedAccountNo,
            bankId: bcaPayout.id,
          },
        },
        update: { accountName: sealAccountName(accountName), isMain: true },
        create: {
          userId: user.id,
          bankId: bcaPayout.id,
          accountNumber: sealedAccountNo,
          accountName: sealAccountName(accountName),
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
