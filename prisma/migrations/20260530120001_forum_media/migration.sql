-- AlterTable
ALTER TABLE `forum_posts` ADD COLUMN `media_urls` JSON NULL;

-- AlterTable
ALTER TABLE `forum_comments` ADD COLUMN `media_urls` JSON NULL;
