-- Jenis ruang chat: tanya produk vs negosiasi harga (bukan tag di specifications).
ALTER TABLE `negotiations`
  ADD COLUMN `room_type` ENUM('INQUIRY', 'NEGOTIATION') NOT NULL DEFAULT 'NEGOTIATION';

UPDATE `negotiations`
SET `room_type` = 'INQUIRY'
WHERE `specifications` LIKE 'PURPOSE:INQUIRY%';

UPDATE `negotiations`
SET `specifications` = NULL
WHERE `specifications` = 'PURPOSE:INQUIRY';

UPDATE `negotiations`
SET `specifications` = TRIM(LEADING '\n' FROM SUBSTRING(`specifications`, LENGTH('PURPOSE:INQUIRY') + 1))
WHERE `specifications` LIKE 'PURPOSE:INQUIRY\n%';

UPDATE `negotiations`
SET `specifications` = NULL
WHERE `specifications` = 'PURPOSE:NEGOTIATION';

UPDATE `negotiations`
SET `specifications` = TRIM(LEADING '\n' FROM SUBSTRING(`specifications`, LENGTH('PURPOSE:NEGOTIATION') + 1))
WHERE `specifications` LIKE 'PURPOSE:NEGOTIATION\n%';

CREATE INDEX `negotiations_buyer_id_product_id_room_type_status_idx`
  ON `negotiations`(`buyer_id`, `product_id`, `room_type`, `status`);
