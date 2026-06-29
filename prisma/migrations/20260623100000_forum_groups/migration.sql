-- CreateTable
CREATE TABLE `forum_groups` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `avatar_url` VARCHAR(191) NULL,
    `banner_url` VARCHAR(191) NULL,
    `owner_id` VARCHAR(191) NOT NULL,
    `is_public` BOOLEAN NOT NULL DEFAULT true,
    `member_count` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `forum_groups_slug_key`(`slug`),
    INDEX `forum_groups_owner_id_idx`(`owner_id`),
    INDEX `forum_groups_is_public_idx`(`is_public`),
    INDEX `forum_groups_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `forum_group_members` (
    `id` VARCHAR(191) NOT NULL,
    `group_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `forum_group_members_user_id_idx`(`user_id`),
    UNIQUE INDEX `forum_group_members_group_id_user_id_key`(`group_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `forum_posts` ADD COLUMN `group_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `forum_posts_group_id_idx` ON `forum_posts`(`group_id`);

-- AddForeignKey
ALTER TABLE `forum_groups` ADD CONSTRAINT `forum_groups_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `forum_group_members` ADD CONSTRAINT `forum_group_members_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `forum_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `forum_group_members` ADD CONSTRAINT `forum_group_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `forum_posts` ADD CONSTRAINT `forum_posts_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `forum_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
