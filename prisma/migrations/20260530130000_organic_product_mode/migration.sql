-- Organic produce + product mode (schema drift fix)
-- categories.product_mode + products organic fields

ALTER TABLE `categories`
    ADD COLUMN `product_mode` ENUM('BIOMASS_MATERIAL', 'ORGANIC_PRODUCE') NULL;

CREATE INDEX `categories_product_mode_idx` ON `categories`(`product_mode`);

ALTER TABLE `products`
    ADD COLUMN `product_mode` ENUM('BIOMASS_MATERIAL', 'ORGANIC_PRODUCE') NOT NULL DEFAULT 'BIOMASS_MATERIAL',
    ADD COLUMN `fertilizer_type` VARCHAR(191) NULL,
    ADD COLUMN `is_chemical_free` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `crop_type` VARCHAR(191) NULL,
    ADD COLUMN `total_sold` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `view_count` INTEGER NOT NULL DEFAULT 0;
