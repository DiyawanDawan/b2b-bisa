-- AlterTable: tambah role COURIER (kurir BISA Express, display/fondasi)
ALTER TABLE `users` MODIFY COLUMN `role` ENUM('SUPPLIER', 'BUYER', 'ADMIN', 'COURIER') NOT NULL DEFAULT 'SUPPLIER';
