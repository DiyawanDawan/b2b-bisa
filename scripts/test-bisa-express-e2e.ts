/**
 * E2E smoke test BISA Express (butuh DB + seed).
 *
 * Jalankan:
 *   npm run seed:bisa-express
 *   npm run test:bisa-express
 */
import request from 'supertest';
import app from '../src/index.js';

const DEMO_PASSWORD = 'password123';

async function login(email: string) {
  const res = await request(app).post('/api/v1/auth/login').send({
    email,
    password: DEMO_PASSWORD,
  });
  if (res.status !== 200) {
    throw new Error(`Login gagal (${email}): ${res.status} ${JSON.stringify(res.body)}`);
  }
  const tokenPayload = res.body.data?.token as
    | string
    | { accessToken?: string; refreshToken?: string }
    | undefined;
  const token = typeof tokenPayload === 'string' ? tokenPayload : tokenPayload?.accessToken;
  const user = res.body.data?.user as { id: string; role: string } | undefined;
  if (!token || !user?.id) {
    throw new Error(`Token/user kosong untuk ${email}`);
  }
  return { token, user };
}

function assert(name: string, condition: boolean, detail?: string) {
  if (!condition) {
    throw new Error(detail ? `${name}: ${detail}` : name);
  }
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log('BISA Express E2E smoke test\n');

  const admin = await login('admin@bisaes.com');
  const supplier = await login('siti.aminah@agritech.com');
  const buyer = await login('h.wijaya@surabayaindustrial.com');

  const hubs = await request(app)
    .get('/api/v1/admin/bisa-express/hubs')
    .set('Authorization', `Bearer ${admin.token}`);
  assert('admin hubs 200', hubs.status === 200);
  assert('min 3 hub', (hubs.body.data?.length ?? 0) >= 3);
  const hubCodes = (hubs.body.data as Array<{ code: string }>).map((h) => h.code);
  assert(
    'hub SMG/JKT/SBY',
    ['HUB-SMG-01', 'HUB-JKT-01', 'HUB-SBY-01'].every((c) => hubCodes.includes(c)),
  );

  const drivers = await request(app)
    .get('/api/v1/admin/bisa-express/drivers')
    .set('Authorization', `Bearer ${admin.token}`);
  assert('admin drivers 200', drivers.status === 200);
  const driverList = drivers.body.data as Array<{ employeeCode: string; user?: { role: string } }>;
  assert(
    'driver DRV-001',
    driverList.some((d) => d.employeeCode === 'DRV-001'),
  );
  assert(
    'role COURIER',
    driverList.some((d) => d.user?.role === 'COURIER'),
  );

  const services = await request(app)
    .get('/api/v1/bisa-express/services')
    .set('Authorization', `Bearer ${buyer.token}`);
  assert('services 200', services.status === 200);
  assert('services array', Array.isArray(services.body.data));

  const calc = await request(app)
    .get('/api/v1/bisa-express/calculate')
    .query({
      weight: 25,
      weightUnit: 'KG',
      sellerId: supplier.user.id,
      buyerId: buyer.user.id,
    })
    .set('Authorization', `Bearer ${buyer.token}`);
  assert('calculate 200', calc.status === 200, JSON.stringify(calc.body));
  const options = calc.body.data?.options ?? calc.body.data ?? [];
  assert('calculate has options', Array.isArray(options) && options.length > 0);

  const shipments = await request(app)
    .get('/api/v1/admin/bisa-express/shipments')
    .query({ page: 1, limit: 20 })
    .set('Authorization', `Bearer ${admin.token}`);
  assert('shipments 200', shipments.status === 200);
  const items = (shipments.body.data?.items ?? shipments.body.data ?? []) as Array<{
    awbNumber: string;
  }>;
  const demoAwb = items.find((s) => s.awbNumber?.startsWith('BEX-'))?.awbNumber;
  if (demoAwb) {
    const track = await request(app)
      .get(`/api/v1/bisa-express/track/${encodeURIComponent(demoAwb)}`)
      .set('Authorization', `Bearer ${buyer.token}`);
    assert(
      'track demo AWB',
      track.status === 200 && track.body.data?.awbNumber === demoAwb,
      demoAwb,
    );
    console.log(`    AWB demo: ${demoAwb}`);
  } else {
    console.log('  ⚠ shipment demo belum ada — pastikan seed:bisa-express + produk seller');
  }

  console.log('\n✅ Semua smoke test BISA Express lulus.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ E2E gagal:', err.message ?? err);
    process.exit(1);
  });
