import bcrypt from 'bcrypt';
import logger from '../../src/config/logger.js';
import {
  sealAddress,
  sealAddressPhone,
  sealShipmentAddress,
  sealShipmentContact,
  sealShipmentPhone,
} from '../../src/utils/piiField.util.ts';

const DEMO_ORDER_NUMBER = 'DEMO-BEX-001';

/** Cari rantai GIS provinsi → kab → kec. */
async function resolveGisChain(prisma, { provinceName, regencyName, districtName }) {
  const country =
    (await prisma.country.findFirst({ where: { code: 'ID' } })) ||
    (await prisma.country.findFirst({ where: { name: 'Indonesia' } }));
  const province = await prisma.province.findFirst({ where: { name: provinceName } });
  if (!province) return { country, province: null, regency: null, district: null };

  let regency = null;
  if (regencyName) {
    regency = await prisma.regency.findFirst({
      where: { provinceId: province.id, name: regencyName },
    });
  }

  let district = null;
  if (regency && districtName) {
    district = await prisma.district.findFirst({
      where: { regencyId: regency.id, name: districtName },
    });
  }

  return { country, province, regency, district };
}

async function upsertHub(prisma, spec, gis) {
  if (!gis.country || !gis.province) {
    logger.warn(`[24b] GIS tidak lengkap untuk hub ${spec.code} — dilewati`);
    return null;
  }

  const existingHub = await prisma.bisaExpressHub.findUnique({
    where: { code: spec.code },
    select: { addressId: true },
  });

  const sealedFullAddress = sealAddress(`Hub BISA Express — ${spec.code}, ${spec.addressLine}`);
  const sealedPhone = sealAddressPhone(spec.contactPhone);

  let address;
  if (existingHub?.addressId) {
    address = await prisma.address.update({
      where: { id: existingHub.addressId },
      data: {
        provinceId: gis.province.id,
        regencyId: gis.regency?.id ?? null,
        districtId: gis.district?.id ?? null,
        fullAddress: sealedFullAddress,
        phoneNumber: sealedPhone,
        latitude: spec.lat,
        longitude: spec.lng,
      },
    });
  } else {
    address = await prisma.address.create({
      data: {
        countryId: gis.country.id,
        provinceId: gis.province.id,
        regencyId: gis.regency?.id ?? null,
        districtId: gis.district?.id ?? null,
        fullAddress: sealedFullAddress,
        zipCode: spec.zipCode ?? '00000',
        phoneNumber: sealedPhone,
        latitude: spec.lat,
        longitude: spec.lng,
      },
    });
  }

  return prisma.bisaExpressHub.upsert({
    where: { code: spec.code },
    update: {
      name: spec.name,
      type: spec.type,
      addressId: address.id,
      contactName: spec.contactName,
      contactPhone: spec.contactPhone,
      operatingHours: spec.operatingHours,
      maxDailyCapacity: spec.maxDailyCapacity,
      isActive: true,
    },
    create: {
      code: spec.code,
      name: spec.name,
      type: spec.type,
      addressId: address.id,
      contactName: spec.contactName,
      contactPhone: spec.contactPhone,
      operatingHours: spec.operatingHours,
      maxDailyCapacity: spec.maxDailyCapacity,
      isActive: true,
    },
  });
}

/** Perbarui alamat profil user agar BISA Express punya GIS lengkap (untuk hitung ongkir / AWB). */
async function ensureProfileGisAddress(prisma, email, gis, fullAddress, lat, lng) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { profile: true },
  });
  if (!user?.profile || !gis.country || !gis.province) return null;

  const data = {
    countryId: gis.country.id,
    provinceId: gis.province.id,
    regencyId: gis.regency?.id ?? null,
    districtId: gis.district?.id ?? null,
    fullAddress: sealAddress(fullAddress),
    latitude: lat,
    longitude: lng,
    phoneNumber: user.phone ? sealAddressPhone(user.phone) : undefined,
  };

  if (user.profile.addressId) {
    await prisma.address.update({ where: { id: user.profile.addressId }, data });
  } else {
    const addr = await prisma.address.create({ data: { ...data, zipCode: '00000' } });
    await prisma.userProfile.update({
      where: { userId: user.id },
      data: { addressId: addr.id },
    });
  }
  return user;
}

function buildDemoAwb(originSeg, destSeg) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `BEX-${originSeg}-${destSeg}-${yy}${mm}${dd}-D001`;
}

function awbSegment(gis) {
  const district = gis.district?.code?.replace(/[^A-Z0-9]/gi, '') || null;
  const regency = gis.regency?.code?.replace(/[^A-Z0-9]/gi, '') || null;
  const province = gis.province?.code?.replace(/[^A-Z0-9]/gi, '') || null;
  return district || regency || province || '0000';
}

/** Titik waktu relatif terhadap sekarang (jam ke belakang). */
function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/**
 * Pastikan shipment demo punya trail tracking lengkap agar UI tidak kosong.
 * Aman dijalankan berulang: hanya membuat bagian yang belum ada.
 */
async function ensureDemoShipmentTrail(prisma, shipment, { driver, hubSmg } = {}) {
  if (!shipment) return;

  // Timeline status: progres wajar dari menunggu pickup hingga siap antar.
  const timeline = [
    {
      status: 'AWAITING_PICKUP',
      hours: 30,
      description: 'Shipment demo seed — menunggu pickup',
      location: 'Semarang Tengah',
      lat: -6.9666,
      lng: 110.4196,
      actorType: 'SYSTEM',
    },
    {
      status: 'PICKUP_ASSIGNED',
      hours: 28,
      description: 'Kurir ditugaskan untuk penjemputan',
      location: 'Semarang Tengah',
      lat: -6.9666,
      lng: 110.4196,
      actorType: 'SYSTEM',
    },
    {
      status: 'PICKED_UP',
      hours: 26,
      description: 'Paket telah dijemput dari seller',
      location: 'Taman Tekno Industrial Park, Semarang Tengah',
      lat: -6.9666,
      lng: 110.4196,
      actorType: 'DRIVER',
    },
    {
      status: 'IN_TRANSIT_TO_HUB',
      hours: 24,
      description: 'Dalam perjalanan menuju hub asal',
      location: 'Jl. Pandanaran, Semarang',
      lat: -6.984,
      lng: 110.4203,
      actorType: 'DRIVER',
    },
    {
      status: 'AT_ORIGIN_HUB',
      hours: 20,
      description: 'Tiba & disortir di Hub Semarang',
      location: 'Hub Semarang (Main)',
      lat: -6.9666,
      lng: 110.4196,
      actorType: 'HUB',
    },
    {
      status: 'IN_TRANSIT',
      hours: 12,
      description: 'Dalam perjalanan menuju tujuan',
      location: 'Semarang',
      lat: -6.9721,
      lng: 110.425,
      actorType: 'SYSTEM',
    },
    {
      status: 'OUT_FOR_DELIVERY',
      hours: 4,
      description: 'Sedang diantar ke alamat penerima',
      location: 'Semarang Utara',
      lat: -6.97,
      lng: 110.43,
      actorType: 'DRIVER',
    },
  ];

  const existingLogs = await prisma.shipmentStatusLog.findMany({
    where: { shipmentId: shipment.id },
    select: { status: true },
  });
  const existingStatuses = new Set(existingLogs.map((l) => l.status));

  const logsToCreate = timeline
    .filter((step) => !existingStatuses.has(step.status))
    .map((step) => ({
      shipmentId: shipment.id,
      status: step.status,
      description: step.description,
      location: step.location,
      latitude: step.lat,
      longitude: step.lng,
      actorType: step.actorType,
      actorId: step.actorType === 'DRIVER' ? (driver?.id ?? null) : null,
      createdAt: hoursAgo(step.hours),
    }));

  if (logsToCreate.length > 0) {
    await prisma.shipmentStatusLog.createMany({ data: logsToCreate });
    logger.info(`[24b] Trail shipment ${shipment.awbNumber}: +${logsToCreate.length} status log`);
  }

  // Majukan status shipment agar selaras dengan trail (siap diantar).
  const finalStatus = 'OUT_FOR_DELIVERY';
  if (shipment.status !== finalStatus || !shipment.pickedUpAt) {
    await prisma.bisaExpressShipment.update({
      where: { id: shipment.id },
      data: {
        status: finalStatus,
        originHubId: shipment.originHubId ?? hubSmg?.id ?? null,
        pickedUpAt: shipment.pickedUpAt ?? hoursAgo(26),
        pickupDriverId: shipment.pickupDriverId ?? driver?.id ?? null,
        deliveryDriverId: shipment.deliveryDriverId ?? driver?.id ?? null,
      },
    });
  }

  // Log hub: catat paket diterima & disortir di hub asal (idempotent).
  if (hubSmg?.id) {
    const existingHubLog = await prisma.shipmentHubLog.findFirst({
      where: { shipmentId: shipment.id, hubId: hubSmg.id },
    });
    if (!existingHubLog) {
      await prisma.shipmentHubLog.create({
        data: {
          shipmentId: shipment.id,
          hubId: hubSmg.id,
          action: 'RECEIVED',
          note: 'Paket diterima & disortir di Hub Semarang (demo)',
          scannedBy: 'Ops Semarang',
          createdAt: hoursAgo(20),
        },
      });
    }
  }

  if (driver?.id) {
    // Percobaan pengiriman: pertama gagal (tidak ada orang), sisanya menunggu re-attempt.
    const existingAttempts = await prisma.deliveryAttempt.count({
      where: { shipmentId: shipment.id },
    });
    if (existingAttempts === 0) {
      await prisma.deliveryAttempt.create({
        data: {
          shipmentId: shipment.id,
          driverId: driver.id,
          attemptNumber: 1,
          result: 'NOBODY_HOME',
          note: 'Penerima tidak di tempat — akan dijadwalkan ulang',
          latitude: -6.97,
          longitude: 110.43,
          attemptedAt: hoursAgo(3),
        },
      });
      logger.info(`[24b] DeliveryAttempt #1 (NOBODY_HOME) untuk ${shipment.awbNumber}`);
    }

    // Titik lokasi kurir sepanjang rute Semarang (idempotent per driver).
    const existingLocations = await prisma.driverLocationLog.count({
      where: { driverId: driver.id },
    });
    if (existingLocations === 0) {
      const route = [
        { lat: -6.9666, lng: 110.4196, speed: 0, hours: 26 },
        { lat: -6.972, lng: 110.421, speed: 32, hours: 24 },
        { lat: -6.9804, lng: 110.4253, speed: 28, hours: 12 },
        { lat: -6.97, lng: 110.43, speed: 18, hours: 4 },
      ];
      await prisma.driverLocationLog.createMany({
        data: route.map((p) => ({
          driverId: driver.id,
          latitude: p.lat,
          longitude: p.lng,
          speed: p.speed,
          heading: 45,
          capturedAt: hoursAgo(p.hours),
        })),
      });
      logger.info(`[24b] DriverLocationLog: +${route.length} titik untuk kurir demo`);
    }
  }
}

/**
 * Hub contoh, kurir COURIER, alamat demo seller/buyer, 1 shipment contoh.
 * Aman dijalankan berulang (upsert / skip jika sudah ada).
 */
export async function seedBisaExpressDemoData(prisma) {
  logger.info('🌱 [24b] Seeding demo BISA Express (hub, kurir, shipment contoh)...');

  const smgTengah = await resolveGisChain(prisma, {
    provinceName: 'Jawa Tengah',
    regencyName: 'Semarang',
    districtName: 'Semarang Tengah',
  });
  const smgUtara = await resolveGisChain(prisma, {
    provinceName: 'Jawa Tengah',
    regencyName: 'Semarang',
    districtName: 'Semarang Utara',
  });
  const jakarta = await resolveGisChain(prisma, { provinceName: 'DKI Jakarta' });
  const jatim = await resolveGisChain(prisma, { provinceName: 'Jawa Timur' });

  const hubSmg = await upsertHub(
    prisma,
    {
      code: 'HUB-SMG-01',
      name: 'Hub Semarang (Main)',
      type: 'MAIN_HUB',
      addressLine: 'Jl. Pandanaran, Semarang Tengah',
      lat: -6.9666,
      lng: 110.4196,
      contactName: 'Ops Semarang',
      contactPhone: '081234567801',
      operatingHours: '07:00-21:00',
      maxDailyCapacity: 250,
      zipCode: '50134',
    },
    smgTengah,
  );

  await upsertHub(
    prisma,
    {
      code: 'HUB-JKT-01',
      name: 'Hub Jakarta',
      type: 'SUB_HUB',
      addressLine: 'Jl. Gatot Subroto, Jakarta Selatan',
      lat: -6.2297,
      lng: 106.8294,
      contactName: 'Ops Jakarta',
      contactPhone: '081234567802',
      operatingHours: '08:00-20:00',
      maxDailyCapacity: 300,
    },
    jakarta,
  );

  await upsertHub(
    prisma,
    {
      code: 'HUB-SBY-01',
      name: 'Hub Surabaya',
      type: 'SUB_HUB',
      addressLine: 'Jl. Raya Gubeng, Surabaya',
      lat: -7.2653,
      lng: 112.7423,
      contactName: 'Ops Surabaya',
      contactPhone: '081234567803',
      operatingHours: '08:00-20:00',
      maxDailyCapacity: 200,
    },
    jatim,
  );

  // Legacy hub dari seed awal — tetap aktif bila ada
  await upsertHub(
    prisma,
    {
      code: 'HUB-MAIN-01',
      name: 'Hub Utama BISA Express',
      type: 'MAIN_HUB',
      addressLine: 'Gudang Sortir Pusat',
      lat: -7.25,
      lng: 112.75,
      contactName: 'Ops Pusat',
      contactPhone: '081234567890',
      operatingHours: '08:00-20:00',
      maxDailyCapacity: 200,
    },
    smgTengah.province ? smgTengah : jakarta,
  );

  const passwordHash = await bcrypt.hash('password123', 10);
  const homeHubId = hubSmg?.id ?? null;

  const courierUser = await prisma.user.upsert({
    where: { email: 'kurir@bisaes.com' },
    update: {
      fullName: 'Budi Santoso',
      role: 'COURIER',
      isEmailVerified: true,
    },
    create: {
      email: 'kurir@bisaes.com',
      fullName: 'Budi Santoso',
      phone: '081200011122',
      password: passwordHash,
      role: 'COURIER',
      isEmailVerified: true,
    },
  });

  await prisma.bisaExpressDriver.upsert({
    where: { userId: courierUser.id },
    update: {
      employeeCode: 'DRV-001',
      homeHubId,
      vehicleType: 'PICKUP_TRUCK',
      vehiclePlate: 'H 1234 BE',
      maxCapacityKg: 1000,
      isActive: true,
      status: 'AVAILABLE',
    },
    create: {
      userId: courierUser.id,
      employeeCode: 'DRV-001',
      homeHubId,
      vehicleType: 'PICKUP_TRUCK',
      vehiclePlate: 'H 1234 BE',
      maxCapacityKg: 1000,
      isActive: true,
      status: 'AVAILABLE',
    },
  });

  const courierUser2 = await prisma.user.upsert({
    where: { email: 'kurir2@bisaes.com' },
    update: { role: 'COURIER', isEmailVerified: true },
    create: {
      email: 'kurir2@bisaes.com',
      fullName: 'Andi Wijaya',
      phone: '081200033344',
      password: passwordHash,
      role: 'COURIER',
      isEmailVerified: true,
    },
  });

  await prisma.bisaExpressDriver.upsert({
    where: { userId: courierUser2.id },
    update: {
      employeeCode: 'DRV-002',
      homeHubId,
      vehicleType: 'VAN',
      vehiclePlate: 'L 5678 CD',
      isActive: true,
      status: 'OFF_DUTY',
    },
    create: {
      userId: courierUser2.id,
      employeeCode: 'DRV-002',
      homeHubId,
      vehicleType: 'VAN',
      vehiclePlate: 'L 5678 CD',
      maxCapacityKg: 500,
      isActive: true,
      status: 'OFF_DUTY',
    },
  });

  const courierDriver = await prisma.bisaExpressDriver.findUnique({
    where: { userId: courierUser.id },
  });

  const seller = await ensureProfileGisAddress(
    prisma,
    'siti.aminah@agritech.com',
    smgTengah,
    'Taman Tekno Industrial Park, Blok B-5, Kec. Semarang Tengah, Semarang',
    -6.9666,
    110.4196,
  );
  const buyer = await ensureProfileGisAddress(
    prisma,
    'h.wijaya@surabayaindustrial.com',
    smgUtara.district ? smgUtara : smgTengah,
    'Surabaya Industrial Hub, Kec. Semarang Utara, Semarang (demo rute)',
    -6.97,
    110.43,
  );

  let demoShipmentCreated = false;
  if (seller && buyer) {
    const existingShipment = await prisma.bisaExpressShipment.findFirst({
      where: { awbNumber: { contains: '-D001' } },
    });

    if (!existingShipment) {
      let order = await prisma.order.findFirst({ where: { orderNumber: DEMO_ORDER_NUMBER } });
      if (!order) {
        const product = await prisma.product.findFirst({
          where: { userId: seller.id },
          select: { id: true, pricePerUnit: true, minOrder: true },
        });

        if (product) {
          const qty = Math.max(Number(product.minOrder) || 10, 25);
          const subtotal = qty * Number(product.pricePerUnit);
          const logisticsFee = 45000;
          const platformFee = Math.round(subtotal * 0.005);
          const vatAmount = Math.round((subtotal + logisticsFee) * 0.11);
          const totalAmount = subtotal + logisticsFee + platformFee + vatAmount;

          order = await prisma.order.create({
            data: {
              orderNumber: DEMO_ORDER_NUMBER,
              buyerId: buyer.id,
              sellerId: seller.id,
              status: 'PROCESSING',
              subtotal,
              platformFee,
              logisticsFee,
              vatAmount,
              totalAmount,
              totalQuantity: qty,
              items: {
                create: [
                  {
                    productId: product.id,
                    quantity: qty,
                    pricePerUnit: product.pricePerUnit,
                    subtotal,
                  },
                ],
              },
              orderShipping: {
                create: {
                  originDestinationId: 0,
                  destinationDestinationId: 0,
                  originLabel: 'Semarang Tengah',
                  destinationLabel: 'Semarang Utara',
                  weight: 25,
                  weightUnit: 'KG',
                  courierCode: 'bisa_express',
                  courierName: 'BISA Express',
                  serviceCode: 'REGULER',
                  serviceName: 'Reguler',
                  shippingCost: logisticsFee,
                  etd: '1',
                },
              },
            },
          });
        } else {
          logger.warn('[24b] Produk seller demo tidak ada — shipment contoh dilewati.');
        }
      }

      if (order) {
        const awbNumber = buildDemoAwb(awbSegment(smgTengah), awbSegment(smgUtara));
        const createdShipment = await prisma.bisaExpressShipment.create({
          data: {
            orderId: order.id,
            awbNumber,
            status: 'AWAITING_PICKUP',
            originHubId: hubSmg?.id ?? null,
            pickupAddress: sealShipmentAddress('Taman Tekno Industrial Park, Semarang Tengah'),
            pickupContact: sealShipmentContact(seller.fullName),
            pickupPhone: sealShipmentPhone(seller.phone ?? '081000000001'),
            pickupLat: -6.9666,
            pickupLng: 110.4196,
            deliveryAddress: sealShipmentAddress('Surabaya Industrial Hub (demo), Semarang Utara'),
            deliveryContact: sealShipmentContact(buyer.fullName),
            deliveryPhone: sealShipmentPhone(buyer.phone ?? '081000000002'),
            deliveryLat: -6.97,
            deliveryLng: 110.43,
            weight: 25,
            weightUnit: 'KG',
            shippingCost: 45000,
            serviceType: 'REGULER',
            etdDays: 1,
            pickupDriverId: courierDriver?.id ?? null,
            statusLogs: {
              create: {
                status: 'AWAITING_PICKUP',
                description: 'Shipment demo seed — menunggu pickup',
                actorType: 'SYSTEM',
              },
            },
          },
        });
        demoShipmentCreated = true;
        logger.info(`[24b] Shipment demo: ${awbNumber}`);
        await ensureDemoShipmentTrail(prisma, createdShipment, {
          driver: courierDriver,
          hubSmg,
        });
      }
    } else {
      logger.info(`[24b] Shipment demo sudah ada: ${existingShipment.awbNumber}`);
      await ensureDemoShipmentTrail(prisma, existingShipment, {
        driver: courierDriver,
        hubSmg,
      });
    }
  } else {
    logger.warn('[24b] User demo siti/hendra tidak ditemukan — lewati alamat & shipment demo.');
  }

  logger.info(
    `✅ [24b] Demo BISA Express: hubs OK, kurir ${courierUser.email}, shipment=${demoShipmentCreated ? 'baru' : 'skip/ada'}`,
  );

  return {
    courierEmail: courierUser.email,
    courierPassword: 'password123',
    demoOrderNumber: DEMO_ORDER_NUMBER,
  };
}
