-- AlterTable: link product categories to biomassa type for cascading selection
ALTER TABLE `categories`
    ADD COLUMN `biomassa_type` ENUM('BIOCHAR', 'SEKAM_PADI', 'TONGKOL_JAGUNG', 'TEMPURUNG_KELAPA', 'WOOD_CHIP', 'OTHER') NULL;

CREATE INDEX `categories_product_mode_biomassa_type_idx` ON `categories`(`product_mode`, `biomassa_type`);
