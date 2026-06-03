-- AlterTable
ALTER TABLE `products` ADD COLUMN `average_rating` DECIMAL(3, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `total_reviews` INTEGER NOT NULL DEFAULT 0;
