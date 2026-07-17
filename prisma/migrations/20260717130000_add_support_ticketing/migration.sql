ALTER TABLE `notifications`
  MODIFY `type` ENUM(
    'ORDER_STATUS',
    'PAYMENT_RECEIVED',
    'IOT_ALERT',
    'SYSTEM_ANNOUNCEMENT',
    'DISPUTE',
    'RFQ',
    'PARTNERSHIP',
    'BOOKING',
    'SUPPORT'
  ) NULL;

CREATE TABLE `support_tickets` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `status` ENUM('OPEN', 'ASSIGNED', 'WAITING_USER', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  `subject` VARCHAR(191) NOT NULL,
  `category` ENUM('ACCOUNT', 'PAYMENT', 'KYC', 'ORDER', 'OTHER') NOT NULL DEFAULT 'OTHER',
  `priority` ENUM('LOW', 'NORMAL', 'HIGH') NOT NULL DEFAULT 'NORMAL',
  `source` ENUM('AI_HANDOFF', 'HELP_CENTER') NOT NULL DEFAULT 'HELP_CENTER',
  `assigned_admin_id` VARCHAR(191) NULL,
  `ai_transcript` JSON NULL,
  `handoff_at` DATETIME(3) NULL,
  `resolved_at` DATETIME(3) NULL,
  `closed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `support_tickets_user_id_status_idx`(`user_id`, `status`),
  INDEX `support_tickets_status_updated_at_idx`(`status`, `updated_at`),
  INDEX `support_tickets_assigned_admin_id_status_idx`(`assigned_admin_id`, `status`),
  INDEX `support_tickets_category_priority_idx`(`category`, `priority`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `support_messages` (
  `id` VARCHAR(191) NOT NULL,
  `ticket_id` VARCHAR(191) NOT NULL,
  `sender_id` VARCHAR(191) NULL,
  `sender_type` ENUM('USER', 'ADMIN', 'SYSTEM') NOT NULL,
  `content` TEXT NOT NULL,
  `attachment_url` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `support_messages_ticket_id_created_at_idx`(`ticket_id`, `created_at`),
  INDEX `support_messages_sender_id_idx`(`sender_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `support_tickets`
  ADD CONSTRAINT `support_tickets_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `support_tickets_assigned_admin_id_fkey`
    FOREIGN KEY (`assigned_admin_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `support_messages`
  ADD CONSTRAINT `support_messages_ticket_id_fkey`
    FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `support_messages_sender_id_fkey`
    FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
