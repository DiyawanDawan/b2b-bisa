-- Mediasi sengketa admin (Hakim BISA)
ALTER TABLE `order_disputes`
  ADD COLUMN `mediation_started_at` DATETIME(3) NULL,
  ADD COLUMN `ready_to_resolve_at` DATETIME(3) NULL,
  ADD COLUMN `mediation_started_by_id` VARCHAR(191) NULL;
