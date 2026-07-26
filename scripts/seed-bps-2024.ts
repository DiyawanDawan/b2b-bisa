import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DB = { host: 'localhost', user: 'root', password: '', database: 'bisa_data', port: 3306 };
const COLUMNS = 24;

async function main() {
  const conn = await mysql.createConnection(DB);

  await conn.query("DELETE FROM market_supply_demand_snapshots WHERE source = 'BPS 2024'");

  const dir = 'D:/HACKATON/Apps/Backend/prisma/seed/data';
  const files = fs.readdirSync(dir).filter(f => f.includes('2024') && f.includes('Produksi'));
  if (!files.length) { console.log('CSV not found'); await conn.end(); return; }

  const csv = fs.readFileSync(path.join(dir, files[0]), 'utf-8');
  const lines = csv.trim().split('\n');
  const header = lines[0].split(',');

  const now = new Date();
  const placeholders = Array(COLUMNS).fill('?').join(',');
  let n = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');

    for (let j = 1; j < cols.length; j++) {
      const raw = cols[j]?.trim();
      if (!raw || raw === '-' || raw === '0') continue;

      const label = header[j]
        .replace('Produksi ', '')
        .replace(/ *\(kuintal\)/g, '')
        .replace(/ *\(Kw\)/g, '')
        .replace(/ *\(kw\)/g, '')
        .replace(/\/TW\/Teropong/g, '')
        .replace(/\(kuintal\)/g, '')
        .replace(/[()]/g, '')
        .trim();
      const qtyKw = parseFloat(raw.replace(/,/g, '.'));
      if (isNaN(qtyKw) || qtyKw <= 0) continue;

      const stockTon = +(qtyKw / 10).toFixed(2);
      const region = cols[0].trim();
      const uniqueLabel = `${label} - ${region}`;
      const values = [
        crypto.randomUUID(), uniqueLabel, 'ORGANIC', null,
        0, 0, qtyKw * 100, stockTon, 1,
        0, 0, 0, 0, 0, 0, 0, null, 'surplus',
        'BPS 2024', region, '2024',
        now, now, 1,
      ];

      if (values.length !== COLUMNS) {
        console.error(`Column mismatch: ${values.length} vs ${COLUMNS}`);
        continue;
      }

      await conn.query(
        `INSERT INTO market_supply_demand_snapshots
         (id, label, category, biomassa_type, product_count, listing_count,
          total_stock_kg, total_stock_ton, province_count, order_count_30d, order_count_90d,
          open_order_count, quantity_kg_30d, quantity_kg_90d, quantity_ton_90d,
          completed_quantity_kg_90d, supply_demand_ratio, balance,
          source, region, period, computed_at, updated_at, is_published)
         VALUES (${placeholders})`,
        values
      );
      n++;
    }
  }

  const [check] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM market_supply_demand_snapshots WHERE source = 'BPS 2024'"
  );
  console.log(`✅ ${check[0].cnt} BPS 2024 snapshots ditambahkan.`);

  const [sample] = await conn.query(
    "SELECT label, region, total_stock_ton FROM market_supply_demand_snapshots WHERE source = 'BPS 2024' ORDER BY total_stock_ton DESC LIMIT 10"
  );
  console.table(sample);

  await conn.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
