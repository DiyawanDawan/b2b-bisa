-- AlterTable
ALTER TABLE `chat_messages` ADD COLUMN `is_deleted` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `chat_messages` ADD COLUMN `edited_at` DATETIME(3) NULL;
ALTER TABLE `chat_messages` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
