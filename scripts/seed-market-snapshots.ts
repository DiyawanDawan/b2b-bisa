import mysql from 'mysql2/promise';
import crypto from 'node:crypto';

const DB = { host: 'localhost', user: 'root', password: '', database: 'bisa_data', port: 3306 };

async function seedMarketSnapshots() {
  const conn = await mysql.createConnection(DB);

  const [existing] = await conn.query('SELECT COUNT(*) AS cnt FROM market_supply_demand_snapshots');
  if (existing[0].cnt > 0) {
    console.log(`   Sudah ada ${existing[0].cnt} snapshot, skip.`);
    await conn.end();
    return;
  }

  const now = new Date();
  const days30 = new Date(now.getTime() - 30 * 86400000);
  const days90 = new Date(now.getTime() - 90 * 86400000);

  const snapshots = [];
  const grades = ['A', 'B', 'C'];
  const types = ['BIOCHAR', 'SEKAM_PADI', 'TONGKOL_JAGUNG', 'TEMPURUNG_KELAPA', 'WOOD_CHIP', 'OTHER'];

  for (const bt of types) {
    if (bt === 'BIOCHAR') {
      for (const g of grades) {
        snapshots.push(await buildBmSnap(conn, bt, g, days30, days90, now));
      }
    } else {
      snapshots.push(await buildBmSnap(conn, bt, null, days30, days90, now));
    }
  }
  snapshots.push(await buildOrgSnap(conn, days30, days90, now));

  for (const s of snapshots) {
    await conn.query(
      `INSERT INTO market_supply_demand_snapshots
       (id, label, category, biomassa_type, grade, product_count, listing_count, total_stock_kg, total_stock_ton,
        province_count, order_count_30d, order_count_90d, open_order_count,
        quantity_kg_30d, quantity_kg_90d, quantity_ton_90d, completed_quantity_kg_90d,
        supply_demand_ratio, balance, computed_at, updated_at, is_published)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [s.id, s.label, s.category, s.biomassa_type, s.grade, s.product_count, s.listing_count,
       s.total_stock_kg, s.total_stock_ton, s.province_count, s.order_count_30d, s.order_count_90d,
       s.open_order_count, s.quantity_kg_30d, s.quantity_kg_90d, s.quantity_ton_90d,
       s.completed_quantity_kg_90d, s.supply_demand_ratio, s.balance, s.computed_at, s.updated_at, 1]
    );
  }

  console.log(`✅ ${snapshots.length} market_supply_demand_snapshots ditambahkan.`);
  await conn.end();
}

async function buildBmSnap(conn, bt, grade, days30, days90, now) {
  const label = grade ? `Biochar Grade ${grade}` : bt.replace(/_/g, ' ');

  const gradeFilter = grade ? `AND grade = '${grade}'` : '';
  const gradeJoin = grade ? `AND p.grade = '${grade}'` : '';

  const [prod] = await conn.query(
    `SELECT COUNT(*) AS cnt, COUNT(DISTINCT province) AS provinces,
            CAST(COALESCE(SUM(stock), 0) AS UNSIGNED) AS stock_kg
     FROM products WHERE product_mode = 'BIOMASS_MATERIAL' AND status = 'ACTIVE'
     AND biomassa_type = '${bt}' ${gradeFilter}`
  );

  const [ord30] = await conn.query(
    `SELECT COUNT(DISTINCT o.id) AS cnt, CAST(COALESCE(SUM(oi.quantity), 0) AS UNSIGNED) AS qty_kg
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE p.product_mode = 'BIOMASS_MATERIAL' AND p.biomassa_type = '${bt}' ${gradeJoin}
     AND o.status != 'CANCELLED' AND o.created_at >= ?`, [days30]
  );
  const [ord90] = await conn.query(
    `SELECT COUNT(DISTINCT o.id) AS cnt, CAST(COALESCE(SUM(oi.quantity), 0) AS UNSIGNED) AS qty_kg
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE p.product_mode = 'BIOMASS_MATERIAL' AND p.biomassa_type = '${bt}' ${gradeJoin}
     AND o.status != 'CANCELLED' AND o.created_at >= ?`, [days90]
  );
  const [comp90] = await conn.query(
    `SELECT CAST(COALESCE(SUM(oi.quantity), 0) AS UNSIGNED) AS qty_kg
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE p.product_mode = 'BIOMASS_MATERIAL' AND p.biomassa_type = '${bt}' ${gradeJoin}
     AND o.status = 'COMPLETED' AND o.created_at >= ?`, [days90]
  );
  const [open] = await conn.query(
    `SELECT COUNT(DISTINCT o.id) AS cnt
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE p.product_mode = 'BIOMASS_MATERIAL' AND p.biomassa_type = '${bt}' ${gradeJoin}
     AND o.status IN ('PENDING','CONFIRMED','PROCESSING')`
  );

  const stockKg = Number(prod[0]?.stock_kg ?? 0);
  const qty90 = Number(ord90[0]?.qty_kg ?? 0);

  return {
    id: crypto.randomUUID(), label, category: 'BIOMASSA',
    biomassa_type: bt, grade: grade ?? null,
    product_count: Number(prod[0]?.cnt ?? 0),
    listing_count: Number(prod[0]?.cnt ?? 0),
    total_stock_kg: stockKg,
    total_stock_ton: +(stockKg / 1000).toFixed(2),
    province_count: Number(prod[0]?.provinces ?? 0),
    order_count_30d: Number(ord30[0]?.cnt ?? 0),
    order_count_90d: Number(ord90[0]?.cnt ?? 0),
    open_order_count: Number(open[0]?.cnt ?? 0),
    quantity_kg_30d: Number(ord30[0]?.qty_kg ?? 0),
    quantity_kg_90d: qty90,
    quantity_ton_90d: +(qty90 / 1000).toFixed(2),
    completed_quantity_kg_90d: Number(comp90[0]?.qty_kg ?? 0),
    supply_demand_ratio: qty90 > 0 ? +(stockKg / qty90).toFixed(2) : null,
    balance: stockKg > qty90 * 2 ? 'surplus' : stockKg > qty90 ? 'balanced' : 'deficit',
    computed_at: now, updated_at: now,
  };
}

async function buildOrgSnap(conn, days30, days90, now) {
  const [prod] = await conn.query(
    `SELECT COUNT(*) AS cnt, COUNT(DISTINCT province) AS provinces,
            CAST(COALESCE(SUM(stock), 0) AS UNSIGNED) AS stock_kg
     FROM products WHERE product_mode = 'ORGANIC_PRODUCE' AND status = 'ACTIVE'`
  );
  const [ord30] = await conn.query(
    `SELECT COUNT(DISTINCT o.id) AS cnt, CAST(COALESCE(SUM(oi.quantity), 0) AS UNSIGNED) AS qty_kg
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE p.product_mode = 'ORGANIC_PRODUCE' AND o.status != 'CANCELLED' AND o.created_at >= ?`, [days30]
  );
  const [ord90] = await conn.query(
    `SELECT COUNT(DISTINCT o.id) AS cnt, CAST(COALESCE(SUM(oi.quantity), 0) AS UNSIGNED) AS qty_kg
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE p.product_mode = 'ORGANIC_PRODUCE' AND o.status != 'CANCELLED' AND o.created_at >= ?`, [days90]
  );
  const [comp90] = await conn.query(
    `SELECT CAST(COALESCE(SUM(oi.quantity), 0) AS UNSIGNED) AS qty_kg
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE p.product_mode = 'ORGANIC_PRODUCE' AND o.status = 'COMPLETED' AND o.created_at >= ?`, [days90]
  );
  const [open] = await conn.query(
    `SELECT COUNT(DISTINCT o.id) AS cnt
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE p.product_mode = 'ORGANIC_PRODUCE' AND o.status IN ('PENDING','CONFIRMED','PROCESSING')`
  );

  const stockKg = Number(prod[0]?.stock_kg ?? 0);
  const qty90 = Number(ord90[0]?.qty_kg ?? 0);

  return {
    id: crypto.randomUUID(), label: 'Produk Organik', category: 'ORGANIC',
    biomassa_type: null, grade: null,
    product_count: Number(prod[0]?.cnt ?? 0),
    listing_count: Number(prod[0]?.cnt ?? 0),
    total_stock_kg: stockKg,
    total_stock_ton: +(stockKg / 1000).toFixed(2),
    province_count: Number(prod[0]?.provinces ?? 0),
    order_count_30d: Number(ord30[0]?.cnt ?? 0),
    order_count_90d: Number(ord90[0]?.cnt ?? 0),
    open_order_count: Number(open[0]?.cnt ?? 0),
    quantity_kg_30d: Number(ord30[0]?.qty_kg ?? 0),
    quantity_kg_90d: qty90,
    quantity_ton_90d: +(qty90 / 1000).toFixed(2),
    completed_quantity_kg_90d: Number(comp90[0]?.qty_kg ?? 0),
    supply_demand_ratio: qty90 > 0 ? +(stockKg / qty90).toFixed(2) : null,
    balance: stockKg > qty90 * 2 ? 'surplus' : stockKg > qty90 ? 'balanced' : 'deficit',
    computed_at: now, updated_at: now,
  };
}

async function main() {
  console.log('🔧 Seeding market_supply_demand_snapshots...\n');
  await seedMarketSnapshots();
  console.log('\n🎉 Selesai.');
}

main().catch((e) => { console.error(e); process.exit(1); });
