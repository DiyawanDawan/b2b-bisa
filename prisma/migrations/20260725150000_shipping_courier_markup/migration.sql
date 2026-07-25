-- AlterTable: markup margin di atas tarif RajaOngkir / BISA Express lokal
ALTER TABLE `shipping_couriers`
  ADD COLUMN `markup_percent` DECIMAL(5, 2) NULL,
  ADD COLUMN `markup_flat` DECIMAL(15, 2) NULL;
