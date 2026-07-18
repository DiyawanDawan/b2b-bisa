-- Triple e-sign + identitas jabatan penandatangan (Buyer / Supplier / Penengah BISA)
ALTER TABLE `buyer_supplier_partnerships`
  ADD COLUMN `platform_signed_at` DATETIME(3) NULL,
  ADD COLUMN `platform_sign_hash` VARCHAR(191) NULL,
  ADD COLUMN `platform_signer_id` VARCHAR(191) NULL,
  ADD COLUMN `buyer_signer_name` VARCHAR(191) NULL,
  ADD COLUMN `buyer_signer_title` VARCHAR(191) NULL,
  ADD COLUMN `buyer_company_name` VARCHAR(191) NULL,
  ADD COLUMN `seller_signer_name` VARCHAR(191) NULL,
  ADD COLUMN `seller_signer_title` VARCHAR(191) NULL,
  ADD COLUMN `seller_company_name` VARCHAR(191) NULL,
  ADD COLUMN `platform_signer_name` VARCHAR(191) NULL,
  ADD COLUMN `platform_signer_title` VARCHAR(191) NULL;
