-- CreateTable
CREATE TABLE IF NOT EXISTS `CompanyProfile` (
    `id` VARCHAR(191) NOT NULL,
    `address_id` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `CompanyProfile_address_id_key`(`address_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CompanyProfile` ADD CONSTRAINT `CompanyProfile_address_id_fkey` FOREIGN KEY (`address_id`) REFERENCES `Address`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
