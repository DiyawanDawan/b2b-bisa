-- AlterTable
ALTER TABLE `negotiations` ADD COLUMN `specifications` TEXT NULL;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `specifications` TEXT NULL;

-- AlterTable
ALTER TABLE `products` MODIFY `status` ENUM('ACTIVE', 'DRAFT', 'INACTIVE', 'BLOCKED', 'OUT_OF_STOCK', 'DELETED') NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX `articles_updated_at_idx` ON `articles`(`updated_at`);

-- CreateIndex
CREATE INDEX `forum_posts_updated_at_idx` ON `forum_posts`(`updated_at`);

-- CreateIndex
CREATE INDEX `users_status_idx` ON `users`(`status`);
