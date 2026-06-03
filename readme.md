# BISA B2B - Backend API & Database Documentation

## 🚀 Persiapan Awal (Setup)

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Konfigurasi Environment**
   Pastikan file `.env` sudah sesuai. Contoh:

   ```env
   DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DATABASE"
   JWT_SECRET="rahasia_anda"
   ```

3. **Generate Prisma Client (Wajib setelah ubah `schema.prisma`)**

   ```bash
   npm run generate
   # atau: npx prisma generate
   ```

   Tanpa langkah ini, backend bisa crash saat start, misalnya:
   `The requested module '#prisma' does not provide an export named 'DisputeStatus'`.

   Lalu apply migration jika ada tabel baru:

   ```bash
   npx prisma migrate deploy
   ```

   _Catatan: Pastikan perintah ini sukses agar IDE tidak error mengenai tipe relasi atau enums (`UserRole`, `DisputeStatus`, dll)._

---

Cara 2: Via Terminal
Jalankan di terminal Anda (bukan di sini):

npm run lint -- --fix
Atau untuk format saja:

Agar otomatis saat save di VS Code:

## 🗄️ Database Management (Prisma v7 ESM)

Gunakan _Prisma CLI_ untuk memanajemen struktur database BISA B2B.

### 1. Migrasi Database (Development)

Saat Anda memodifikasi `schema.prisma` dan ingin men-sinkronisasikan ke MySQL:

```bash
npx prisma db push
```

> **Tip:** Gunakan perintah ini agar perubahan skema langsung diaplikasikan tanpa perlu membuat histori file migrasi yang menumpuk selama proses pengembangan iteratif.

Jika Anda ingin menyimpan histori migrasi produksi:

```bash
npx prisma migrate dev --name deskripsi_perubahan
```

### 2. Seeding Database (Data Awal)

Untuk memasukkan data referensi awal (seperti kategori produk, atau akun super-admin) berdasarkan script di `prisma/seed/index.js`, jalankan:

```bash
npm run seed
```

> Sistem sudah dikonfigurasi menggunakan ESM Node (`"type": "module"`).

### 3. Prisma Studio (GUI Database)

Untuk melihat dan mengedit isi database MySQL langsung melalui browser tanpa IDE external:

```bash
npx prisma studio
```

---

## 💻 Menjalankan Server (Development)

Untuk menghidupkan backend Express.js server:

```bash
npm run dev
```

Atau tanpa watch mode:

```bash
npm run start
```

_(Lihat `package.json` untuk alias script lain seperti `npm run lint` untuk pemeriksaan kode)._

**Setelah pull migration baru** (contoh: chat message edit/delete, notification `DISPUTE`):

```bash
npx prisma migrate deploy
npm run fromat
npx prisma migrate dev
npm run generate
npx prisma migrate reset
npm run seed
npm run dev
```

Restart proses backend agar Prisma Client terbaru dimuat.

---

## 🛡️ Catatan Keamanan Skema

- **Hardening Role**: Validasi rute menggunakan middleware `requireRole('SUPPLIER', 'ADMIN')`.
- **Global UUID**: Semua table menggunakan ID teracak (`UUID`) sebagai pencegahan _scraping_.
- **Desimal Presisi**: Logistik (berat) dan Finansial (harga, komisi, total) ketat menggunakan tipe `Decimal(15,2)`.
