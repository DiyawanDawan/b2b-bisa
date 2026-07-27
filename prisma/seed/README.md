# Prisma seed

## Official entry

Run the full seed via:

```bash
npm run seed
```

This executes `prisma db seed` → `tsx prisma/seed/index.js` only. Do not invoke individual numbered seeder files directly unless you know the dependency order.

## Partial seed scripts

From `package.json` (scoped re-runs, not a full DB reset):

| Script                           | Purpose            |
| -------------------------------- | ------------------ |
| `npm run seed:forum-groups`      | Forum groups       |
| `npm run seed:forum-group-posts` | Forum group posts  |
| `npm run seed:reviews`           | Reviews / delivery |
| `npm run seed:organic-harvest`   | Organic harvest    |
| `npm run seed:bookings`          | Bookings           |
| `npm run seed:partnerships`      | Partnerships       |
| `npm run seed:bisa-express`      | BISA Express       |
| `npm run seed:vouchers`          | Vouchers           |

## Do not run deleted orphans

These legacy files were removed and are **not** wired from `index.js`:

- `users.seeder.js` → use `04-users.seeder.js`
- `products.seeder.js` → use `05-products.seeder.js`
- `categories.seeder.js` → use `01-taxonomies.seeder.js`
- `03-regions.seeder.js` → use `02b-regions.seeder.js`

## Encryption

Set `ENCRYPTION_KEY` to the **same value as runtime** before seeding. Seeded PII/NPWP/payout fields are encrypted with that key; a mismatch breaks decrypt at login/API.

## Demo passwords (elite accounts)

All elite demo users use password `password123`:

- `admin@bisaes.com` — Super Admin
- `h.wijaya@surabayaindustrial.com` — PRO buyer (Hendra)
- `siti.aminah@agritech.com` — PRO supplier (Siti)
- `hello@greenearth.co` — PRO supplier (Green Earth)
