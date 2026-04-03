# Phase 7 Plan: Prediksi Harga Dasar (Market Insight)

## 📌 Latar Belakang

Sebagai penutup tahapan _MVP Extended_, BISA akan menghadirkan fitur **Prediksi Harga Cerdas**, seperti yang dijabarkan pada proposal (poin tentang "Prediksi Harga - Exponential Smoothing"). Fitur ini sangat berharga bagi Petani maupun Industri untuk memprediksi tren harga limbah biomassa dan biochar, memberikan rekomendasi kapan waktu jual optimal.

## 🎯 Tujuan (Objective)

1. Mengintegrasikan algoritma peramalan harga (seperti Exponential Smoothing) ke dalam backend BISA.
2. Menyajikan data historis harga pasar untuk di-konsumsi (render) secara optimal di sisi Frontend menggunakan grafis seperti _ApexCharts_.

## 📝 Daftar Task (Issue Breakdown)

### 1. Penyediaan Data Dummy & Ekstraksi Model

- **File**: `src/services/market.service.ts` (jika baru) / `prisma/schema.prisma`
- **Tugas**:
  - Memanfaatkan model `MarketTrend` di dalam basis data untuk menyimpan data tren historis.
  - Buat _Seeder_ kecil untuk mengisi data historis pergerakan harga Biochar dan Sekam dalam satu tahun terakhir.

### 2. Algoritma Prediksi Harga (Exponential Smoothing / Tren AI)

- **File**: `src/services/market.service.ts` / `src/services/ai.service.ts`
- **Tugas**:
  - Opsional 1: Buat formula statistik untuk _Holt-Winters Exponential Smoothing_.
  - Opsional 2: Manfaatkan Gemini AI untuk menganalisa array harga historis dan mengembalikan proyeksi / tren pergerakan harga dalam bentuk spesifik (JSON Array) dengan pertimbangan inflasi.
  - Hasilkan output berupa: `[Tanggal, Harga Prediksi, Batas Atas, Batas Bawah]`.

### 3. API Integrasi Grafik Frontend

- **File**: `src/controllers/market.controller.ts`, `src/routes/market.ts`
- **Tugas**:
  - Buat API `GET /api/v1/market-trends/prices` yang dapat difilter berdasarkan jenis biomassa (`BIOCHAR`, `SEKAM_PADI`, dll).
  - Format respon API harus `Production-Ready`, yakni menggunakan array `series` yang siap di _inject_ langsung ke _charting library_ UI.

---

**Status**: Mengantre (Queued)
