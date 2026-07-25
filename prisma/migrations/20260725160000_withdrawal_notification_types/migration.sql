-- AlterEnum NotificationType: withdrawal success/failure (+ admin alert)
ALTER TABLE `notifications`
  MODIFY COLUMN `type` ENUM(
    'ORDER_STATUS',
    'PAYMENT_RECEIVED',
    'IOT_ALERT',
    'SYSTEM_ANNOUNCEMENT',
    'PRODUCT_CERTIFICATE',
    'DISPUTE',
    'RFQ',
    'PARTNERSHIP',
    'BOOKING',
    'SUPPORT',
    'WITHDRAWAL_SUCCESS',
    'WITHDRAWAL_FAILED',
    'ADMIN_WITHDRAWAL_FAILED'
  ) NULL;
