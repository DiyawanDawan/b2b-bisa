-- CreateTable
CREATE TABLE `knowledge_documents` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `source_type` ENUM('PDF', 'TXT', 'MD', 'TEXT') NOT NULL,
    `file_name` VARCHAR(255) NULL,
    `mime_type` VARCHAR(128) NULL,
    `storage_key` VARCHAR(512) NULL,
    `chroma_collection` VARCHAR(128) NOT NULL DEFAULT 'bisa_knowledge',
    `chunk_count` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('PENDING', 'INDEXED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `error_message` TEXT NULL,
    `uploaded_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_documents_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `knowledge_documents` ADD CONSTRAINT `knowledge_documents_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
