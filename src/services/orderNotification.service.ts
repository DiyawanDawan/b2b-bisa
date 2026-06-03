import prisma from '#config/prisma';
import { NotificationPriority, NotificationType } from '#prisma';
import { createNotification } from '#services/notification.service';

type OrderStatusNotify = 'PROCESSING' | 'SHIPPED' | 'COMPLETED';

const STATUS_TEMPLATES: Record<
  OrderStatusNotify,
  { buyer: { title: string; body: string }; seller: { title: string; body: string } }
> = {
  PROCESSING: {
    buyer: {
      title: 'Pembayaran Diterima',
      body: 'Pesanan {orderNumber} sedang diproses supplier.',
    },
    seller: {
      title: 'Pesanan Baru Dibayar',
      body: 'Pesanan {orderNumber} siap diproses. Segera update pengiriman.',
    },
  },
  SHIPPED: {
    buyer: {
      title: 'Pesanan Dikirim',
      body: 'Pesanan {orderNumber} sedang dalam pengiriman.',
    },
    seller: {
      title: 'Status Pengiriman Diupdate',
      body: 'Pesanan {orderNumber} ditandai dikirim.',
    },
  },
  COMPLETED: {
    buyer: {
      title: 'Pesanan Selesai',
      body: 'Pesanan {orderNumber} telah selesai.',
    },
    seller: {
      title: 'Pesanan Selesai',
      body: 'Dana pesanan {orderNumber} telah dirilis ke dompet Anda.',
    },
  },
};

export const notifyOrderStatusChange = async (params: {
  buyerId: string;
  sellerId: string;
  orderId: string;
  orderNumber: string;
  status: OrderStatusNotify;
}) => {
  const { buyerId, sellerId, orderId, orderNumber, status } = params;
  const template = STATUS_TEMPLATES[status];
  const buyerBody = template.buyer.body.replace('{orderNumber}', orderNumber);
  const sellerBody = template.seller.body.replace('{orderNumber}', orderNumber);

  void createNotification({
    userId: buyerId,
    title: template.buyer.title,
    body: buyerBody,
    type: NotificationType.ORDER_STATUS,
    priority: NotificationPriority.MEDIUM,
    refId: orderId,
  }).catch(() => {});

  void createNotification({
    userId: sellerId,
    title: template.seller.title,
    body: sellerBody,
    type: NotificationType.ORDER_STATUS,
    priority: NotificationPriority.MEDIUM,
    refId: orderId,
  }).catch(() => {});
};

export const notifyOrderProcessingById = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, buyerId: true, sellerId: true },
  });
  if (!order) return;
  await notifyOrderStatusChange({
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: 'PROCESSING',
  });
};
