-- Negotiation closure fields (schema drift fix)

ALTER TABLE `negotiations`
    ADD COLUMN `rejection_reason` TEXT NULL,
    ADD COLUMN `closed_by` VARCHAR(191) NULL;
