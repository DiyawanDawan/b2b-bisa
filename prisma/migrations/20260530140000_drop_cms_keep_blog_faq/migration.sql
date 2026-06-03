-- Drop CMS Elite system; keep faqs, articles, policies, platform_settings (standalone)

-- Drop foreign keys referencing cms_sections
ALTER TABLE `faqs` DROP FOREIGN KEY `faqs_section_id_fkey`;
ALTER TABLE `policies` DROP FOREIGN KEY `policies_section_id_fkey`;
ALTER TABLE `platform_settings` DROP FOREIGN KEY `platform_settings_section_id_fkey`;
ALTER TABLE `content_cards` DROP FOREIGN KEY `content_cards_section_id_fkey`;
ALTER TABLE `impact_metrics` DROP FOREIGN KEY `impact_metrics_section_id_fkey`;
ALTER TABLE `team_members` DROP FOREIGN KEY `team_members_section_id_fkey`;

-- Drop CMS-only tables
DROP TABLE `cms_menu_items`;
DROP TABLE `content_cards`;
DROP TABLE `impact_metrics`;
DROP TABLE `team_members`;
DROP TABLE `cms_sections`;
DROP TABLE `cms_pages`;
DROP TABLE `cms_menus`;

-- Refactor faqs (keep table)
DROP INDEX `faqs_section_id_idx` ON `faqs`;
ALTER TABLE `faqs` DROP COLUMN `section_id`;
CREATE INDEX `faqs_order_idx` ON `faqs`(`order`);

-- Refactor policies
DROP INDEX `policies_section_id_idx` ON `policies`;
ALTER TABLE `policies` DROP COLUMN `section_id`;

-- Refactor platform_settings
DROP INDEX `platform_settings_section_id_idx` ON `platform_settings`;
ALTER TABLE `platform_settings` DROP COLUMN `section_id`;
ALTER TABLE `platform_settings` DROP COLUMN `image_url`;
