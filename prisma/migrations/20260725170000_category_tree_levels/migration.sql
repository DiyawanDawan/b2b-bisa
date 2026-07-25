-- Category tree: parentId + level (Tokopedia-style L1/L2/L3)
-- Drop global unique name; uniqueness becomes (parent_id, name).

ALTER TABLE `categories` DROP INDEX `categories_name_key`;

ALTER TABLE `categories`
  ADD COLUMN `level` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `parent_id` VARCHAR(191) NULL;

CREATE INDEX `categories_parent_id_idx` ON `categories`(`parent_id`);
CREATE INDEX `categories_level_idx` ON `categories`(`level`);

-- MySQL: unique (parent_id, name). Multiple NULL parent_id rows with distinct names are allowed.
CREATE UNIQUE INDEX `categories_parent_id_name_key` ON `categories`(`parent_id`, `name`);

ALTER TABLE `categories`
  ADD CONSTRAINT `categories_parent_id_fkey`
  FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
