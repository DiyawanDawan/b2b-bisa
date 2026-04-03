/*
  Warnings:

  - You are about to drop the column `price_per_kg` on the `negotiations` table. All the data in the column will be lost.
  - You are about to drop the column `quantity_kg` on the `negotiations` table. All the data in the column will be lost.
  - You are about to drop the column `price_per_kg` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `quantity_kg` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `total_weight_kg` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `price_per_kg` on the `products` table. All the data in the column will be lost.
  - Added the required column `price_per_unit` to the `negotiations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price_per_unit` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantity` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total_quantity` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price_per_unit` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `negotiations` DROP COLUMN `price_per_kg`,
    DROP COLUMN `quantity_kg`,
    ADD COLUMN `price_per_unit` DECIMAL(15, 2) NOT NULL,
    ADD COLUMN `quantity` DECIMAL(15, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `order_items` DROP COLUMN `price_per_kg`,
    DROP COLUMN `quantity_kg`,
    ADD COLUMN `price_per_unit` DECIMAL(15, 2) NOT NULL,
    ADD COLUMN `quantity` DECIMAL(15, 2) NOT NULL;

-- AlterTable
ALTER TABLE `orders` DROP COLUMN `total_weight_kg`,
    ADD COLUMN `total_quantity` DECIMAL(15, 2) NOT NULL;

-- AlterTable
ALTER TABLE `products` DROP COLUMN `price_per_kg`,
    ADD COLUMN `price_per_unit` DECIMAL(15, 2) NOT NULL;

-- AlterTable
ALTER TABLE `user_verifications` ADD COLUMN `rejection_reason` TEXT NULL;

-- CreateIndex
CREATE INDEX `products_province_regency_idx` ON `products`(`province`, `regency`);
