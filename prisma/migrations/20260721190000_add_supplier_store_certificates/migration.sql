-- CreateTable
CREATE TABLE `supplier_store_certificates` (
    `id` VARCHAR(191) NOT NULL,
    `supplier_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `certificate_type` VARCHAR(191) NOT NULL,
    `issuer_name` VARCHAR(191) NULL,
    `certificate_number` VARCHAR(191) NULL,
    `issued_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `storage_key` TEXT NOT NULL,
    `file_name` VARCHAR(191) NOT NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `file_size_bytes` BIGINT NOT NULL,
    `sha256` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewed_by_id` VARCHAR(191) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `rejection_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `supplier_store_certificates_supplier_id_status_idx`(`supplier_id`, `status`),
    INDEX `supplier_store_certificates_status_created_at_idx`(`status`, `created_at`),
    INDEX `supplier_store_certificates_reviewed_by_id_idx`(`reviewed_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `supplier_store_certificates` ADD CONSTRAINT `supplier_store_certificates_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_store_certificates` ADD CONSTRAINT `supplier_store_certificates_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
