# Phase 6 Plan: Forum Komunitas & Chatbot AI

## 📌 Latar Belakang

Setelah fitur produksi (IoT) siap, tahap _MVP Extended_ berlanjut dengan membangun komunitas B2B yang tangguh. Petani, penyuluh, dan pembeli memerlukan wadah edukasi untuk berdiskusi seputar standar Biochar. Selain itu, fitur AI Chatbot akan dibenamkan menggunakan Gemini Model untuk menjawab pertanyaan otomatis mengenai biochar dan pertanian sirkular.

## 🎯 Tujuan (Objective)

1. Menyiapkan REST API yang komprehensif untuk Forum (Post, Comment, Vote) yang terintegrasi dengan validasi tipe data Prisma (`ForumPost`, `ForumComment`, `ForumVote`).
2. Mengimplementasikan fitur Tanya Jawab dengan Chatbot AI menggunakan Google Gemini API.

## 📝 Daftar Task (Issue Breakdown)

### 1. Finalisasi Forum Service & Controllers

- **File**: `src/services/forum.service.ts`, `src/controllers/forum.controller.ts`, `src/routes/forum.ts`
- **Tugas**:
  - Implementasikan endpoint `GET /api/v1/forums` dengan fitur paginasi (page, limit) dan pencarian by keyword atau Kategori.
  - Implementasikan pembuatan Post baru dan fitur Comment di bawah suatu Post.
  - Tambahkan sistem Voting (Upvote / Downvote) untuk mengurutkan diskusi paling bermanfaat. Pastikan satu user hanya bisa vote sekali per post/comment.

### 2. Integrasi Chatbot AI (Gemini)

- **File**: `src/services/ai.service.ts`, `src/controllers/ai.controller.ts`, `src/routes/ai.ts`
- **Tugas**:
  - Buat API endpoint khusus `POST /api/v1/ai/chatbot`.
  - Susun prompt internal (System Prompt) di level service agar model AI (Gemini) bertindak sebagai "Asisten Pertanian Ekosistem BISA".
  - Batasi ranah jawaban AI agar berfokus pada biochar, limbah, dan praktik pertanian berkelanjutan berdasarkan standar CSA Bank Indonesia / BRIN.

### 3. Moderasi Konten (Opsional / Low Priority)

- **File**: `src/services/forum.service.ts`
- **Tugas**:
  - Aturan dasar (contoh: post dengan banyak report/downvote otomatis ter-flag atau pindah status menjadi `ARCHIVED`).

---

**Status**: Mengantre (Queued)
