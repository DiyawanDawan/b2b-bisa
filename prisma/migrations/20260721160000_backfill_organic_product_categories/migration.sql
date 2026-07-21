-- Idempotent backfill: kategori hasil pertanian (ORGANIC_PRODUCE).
-- Deploy hanya menjalankan migrate deploy; seed taxonomy tidak otomatis.
-- Setelah deploy, flush cache kategori Redis jika masih ada respons kosong (TTL ~6 jam).

INSERT INTO `categories` (`id`, `name`, `description`, `category_type`, `product_mode`, `biomassa_type`, `created_at`)
VALUES
  (UUID(), 'Beras Organik', 'Beras organik bebas kimia premium', 'PRODUK', 'ORGANIC_PRODUCE', NULL, NOW()),
  (UUID(), 'Sayur Segar', 'Sayuran segar hidroponik dan organik', 'PRODUK', 'ORGANIC_PRODUCE', NULL, NOW()),
  (UUID(), 'Biji-bijian', 'Kacang, jagung, dan biji organik', 'PRODUK', 'ORGANIC_PRODUCE', NULL, NOW()),
  (UUID(), 'Buah Organik', 'Buah segar organik nusantara', 'PRODUK', 'ORGANIC_PRODUCE', NULL, NOW()),
  (UUID(), 'Umbi & Akar', 'Kentang, ubi, dan umbi organik', 'PRODUK', 'ORGANIC_PRODUCE', NULL, NOW()),
  (UUID(), 'Rempah Organik', 'Jahe, kunyit, dan rempah organik', 'PRODUK', 'ORGANIC_PRODUCE', NULL, NOW())
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `category_type` = VALUES(`category_type`),
  `product_mode` = VALUES(`product_mode`),
  `biomassa_type` = VALUES(`biomassa_type`);
