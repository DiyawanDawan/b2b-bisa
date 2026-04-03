/*
  Warnings:

  - You are about to drop the column `is_active` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `products_is_active_idx` ON `products`;

-- AlterTable
ALTER TABLE `products` DROP COLUMN `is_active`,
    ADD COLUMN `status` ENUM('ACTIVE', 'DRAFT', 'BLOCKED', 'OUT_OF_STOCK') NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE `users` DROP COLUMN `is_active`,
    ADD COLUMN `status` ENUM('ACTIVE', 'BLOCKED', 'INACTIVE', 'DELETED') NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX `products_status_idx` ON `products`(`status`);
