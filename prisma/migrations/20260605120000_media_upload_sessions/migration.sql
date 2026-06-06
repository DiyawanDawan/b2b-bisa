-- CreateTable
CREATE TABLE `media_upload_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `folder` VARCHAR(191) NOT NULL,
    `file_name` VARCHAR(191) NOT NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `total_bytes` BIGINT NOT NULL,
    `part_size` INTEGER NOT NULL,
    `total_parts` INTEGER NOT NULL,
    `r2_upload_id` VARCHAR(191) NULL,
    `r2_key` VARCHAR(191) NOT NULL,
    `status` ENUM('INIT', 'UPLOADING', 'COMPLETED', 'ABORTED', 'EXPIRED') NOT NULL DEFAULT 'INIT',
    `completed_parts` JSON NULL,
    `final_path` TEXT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `media_upload_sessions_user_id_idx`(`user_id`),
    INDEX `media_upload_sessions_status_idx`(`status`),
    INDEX `media_upload_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `media_upload_sessions` ADD CONSTRAINT `media_upload_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
