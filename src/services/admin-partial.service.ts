import prisma from '#config/prisma';
import AppError from '#utils/appError';
import {
  OrderStatus,
  ProductStatus,
  PartnershipStatus,
  TransactionStatus,
  NotificationType,
  Prisma,
  TrendCategory,
  TrendType,
} from '#prisma';
import { createAuditLog } from '#services/admin.service';
import {
  executeDisputeRefundInTx,
  attemptXenditRefundForTransaction,
} from '#services/wallet.service';
import { createNotification } from '#services/notification.service';
import { invalidateCategories, invalidatePolicies } from '#utils/cache.util';
import { resolveMediaField } from '#utils/mediaResolver.util';

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */
/* -------------------------------------------------------------------------- */

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.COMPLETED, OrderStatus.DISPUTED],
  [OrderStatus.DISPUTED]: [],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

export const getAllowedOrderTransitions = (status: OrderStatus) =>
  ORDER_STATUS_TRANSITIONS[status] ?? [];

export const updateOrderStatusAdmin = async (
  orderId: string,
  nextStatus: OrderStatus,
  reason: string,
  adminId: string,
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      orderNumber: true,
      buyerId: true,
      sellerId: true,
      dispute: { select: { id: true, status: true } },
      transaction: { select: { id: true, status: true } },
    },
  });
  if (!order) throw new AppError('Pesanan tidak ditemukan', 404);

  if (nextStatus === OrderStatus.CANCELLED) {
    throw new AppError('Gunakan endpoint cancel untuk membatalkan pesanan', 400);
  }

  const allowed = getAllowedOrderTransitions(order.status);
  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      `Transisi status ${order.status} → ${nextStatus} tidak diizinkan. Diizinkan: ${allowed.join(', ') || 'tidak ada'}`,
      400,
    );
  }

  if (nextStatus === OrderStatus.DISPUTED && !order.dispute) {
    throw new AppError(
      'Eskalasi ke DISPUTED memerlukan sengketa aktif. Buka /disputes atau minta buyer/supplier ajukan sengketa.',
      400,
    );
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: nextStatus },
  });

  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_ORDER_STATUS',
    entity: 'ORDER',
    entityId: orderId,
    oldValue: { status: order.status },
    newValue: { status: nextStatus, reason },
  });

  void createNotification({
    userId: order.buyerId,
    title: 'Status Pesanan Diperbarui',
    body: `Pesanan ${order.orderNumber} diubah admin menjadi ${nextStatus}. Alasan: ${reason}`,
    type: NotificationType.ORDER_STATUS,
    refId: orderId,
  });
  void createNotification({
    userId: order.sellerId,
    title: 'Status Pesanan Diperbarui',
    body: `Pesanan ${order.orderNumber} diubah admin menjadi ${nextStatus}. Alasan: ${reason}`,
    type: NotificationType.ORDER_STATUS,
    refId: orderId,
  });

  return {
    order: updated,
    previousStatus: order.status,
    reason,
    links: buildOrderActionLinks(orderId, nextStatus, order.dispute?.id ?? null, order.transaction),
  };
};

export const cancelOrderAdmin = async (
  orderId: string,
  reason: string,
  adminId: string,
  options: { refund?: boolean } = {},
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      transaction: true,
      dispute: { select: { id: true, status: true } },
      items: { select: { productId: true, quantity: true } },
    },
  });
  if (!order) throw new AppError('Pesanan tidak ditemukan', 404);

  const cancellable: OrderStatus[] = [
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
  ];
  if (!cancellable.includes(order.status)) {
    if (order.status === OrderStatus.SHIPPED) {
      throw new AppError(
        'Pesanan sudah dikirim. Eskalasi ke sengketa (/disputes) untuk refund, jangan batalkan langsung.',
        400,
      );
    }
    throw new AppError(`Pesanan berstatus ${order.status} tidak dapat dibatalkan`, 400);
  }

  const shouldRefund =
    Boolean(options.refund) && order.transaction?.status === TransactionStatus.ESCROW_HELD;

  let refunded = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let refundTx: any = null;

  const updated = await prisma.$transaction(async (tx) => {
    if (shouldRefund && order.transaction) {
      refundTx = await executeDisputeRefundInTx(tx, {
        id: order.id,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        transaction: {
          id: order.transaction.id,
          status: order.transaction.status,
          sellerAmount: order.transaction.sellerAmount,
          amount: order.transaction.amount,
          paymentRequestId: order.transaction.paymentRequestId,
          xenditInvoiceId: order.transaction.xenditInvoiceId,
          paymentStatus: order.transaction.paymentStatus,
        },
      });
      refunded = true;
    } else {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: 'CANCEL_ORDER',
        entity: 'ORDER',
        entityId: orderId,
        oldValue: { status: order.status },
        newValue: { status: OrderStatus.CANCELLED, reason, refunded },
      },
    });

    return tx.order.findUnique({ where: { id: orderId } });
  });

  if (refunded && refundTx) {
    void attemptXenditRefundForTransaction(refundTx, reason);
  }

  void createNotification({
    userId: order.buyerId,
    title: 'Pesanan Dibatalkan Admin',
    body: `Pesanan ${order.orderNumber} dibatalkan. Alasan: ${reason}`,
    type: NotificationType.ORDER_STATUS,
    refId: orderId,
  });
  void createNotification({
    userId: order.sellerId,
    title: 'Pesanan Dibatalkan Admin',
    body: `Pesanan ${order.orderNumber} dibatalkan. Alasan: ${reason}`,
    type: NotificationType.ORDER_STATUS,
    refId: orderId,
  });

  return {
    order: updated,
    previousStatus: order.status,
    reason,
    refunded,
    links: buildOrderActionLinks(
      orderId,
      OrderStatus.CANCELLED,
      order.dispute?.id ?? null,
      order.transaction,
    ),
  };
};

function buildOrderActionLinks(
  orderId: string,
  status: OrderStatus,
  disputeId: string | null,
  transaction: { id: string; status?: TransactionStatus } | null,
) {
  return {
    refund:
      transaction?.status === TransactionStatus.ESCROW_HELD
        ? `/disputes/${orderId}`
        : disputeId
          ? `/disputes/${orderId}`
          : null,
    escalation:
      status === OrderStatus.SHIPPED || status === OrderStatus.DISPUTED
        ? `/disputes/${orderId}`
        : null,
    audit: `/orders/${orderId}`,
  };
}

export const getOrderTimelineAdmin = async (
  orderId: string,
  params: { page?: number; limit?: number } = {},
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, createdAt: true, updatedAt: true, orderNumber: true },
  });
  if (!order) throw new AppError('Pesanan tidak ditemukan', 404);

  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Prisma.AuditLogWhereInput = {
    entity: 'ORDER',
    entityId: orderId,
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        action: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const timeline = [
    {
      id: `created-${order.id}`,
      action: 'ORDER_CREATED',
      at: order.createdAt,
      actor: null,
      oldValue: null,
      newValue: { status: OrderStatus.PENDING, orderNumber: order.orderNumber },
    },
    ...logs.map((l) => ({
      id: l.id,
      action: l.action,
      at: l.createdAt,
      actor: l.user,
      oldValue: l.oldValue,
      newValue: l.newValue,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      allowedTransitions: getAllowedOrderTransitions(order.status),
      links: buildOrderActionLinks(orderId, order.status, null, null),
    },
    timeline: timeline.slice(0, limit),
    pagination: { total: total + 1, page, limit, totalPages: Math.ceil((total + 1) / limit) },
  };
};

/* -------------------------------------------------------------------------- */
/* Products                                                                   */
/* -------------------------------------------------------------------------- */

export const updateProductMetadataAdmin = async (
  productId: string,
  data: {
    name?: string;
    description?: string | null;
    categoryId?: string | null;
    pricePerUnit?: number;
    minOrder?: number;
    province?: string | null;
    regency?: string | null;
  },
  adminId: string,
) => {
  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      description: true,
      categoryId: true,
      pricePerUnit: true,
      minOrder: true,
      province: true,
      regency: true,
    },
  });
  if (!existing) throw new AppError('Produk tidak ditemukan', 404);

  if (data.categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!cat || !cat.isActive) throw new AppError('Kategori tidak ditemukan atau nonaktif', 400);
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      ...(data.pricePerUnit !== undefined && { pricePerUnit: data.pricePerUnit }),
      ...(data.minOrder !== undefined && { minOrder: data.minOrder }),
      ...(data.province !== undefined && { province: data.province }),
      ...(data.regency !== undefined && { regency: data.regency }),
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_PRODUCT_METADATA',
    entity: 'PRODUCT',
    entityId: productId,
    oldValue: {
      name: existing.name,
      description: existing.description,
      categoryId: existing.categoryId,
      pricePerUnit: Number(existing.pricePerUnit),
      minOrder: Number(existing.minOrder),
      province: existing.province,
      regency: existing.regency,
    },
    newValue: data as Prisma.InputJsonValue,
  });

  return updated;
};

export const getProductModerationHistory = async (
  productId: string,
  params: { page?: number; limit?: number } = {},
) => {
  const exists = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!exists) throw new AppError('Produk tidak ditemukan', 404);

  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Prisma.AuditLogWhereInput = {
    entity: 'PRODUCT',
    entityId: productId,
    action: {
      in: ['MODERATE_PRODUCT', 'CERTIFY_PRODUCT', 'UPDATE_PRODUCT_METADATA', 'SUSPEND_PRODUCT'],
    },
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        action: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

const categorySelect = {
  id: true,
  name: true,
  description: true,
  categoryType: true,
  productMode: true,
  biomassaType: true,
  isActive: true,
  createdAt: true,
  _count: { select: { products: true, articles: true, forumPosts: true } },
} as const;

export const deleteCategoryAdmin = async (id: string, adminId: string, reason?: string) => {
  const existing = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      _count: { select: { products: true, articles: true, forumPosts: true, rfqs: true } },
    },
  });
  if (!existing) throw new AppError('Kategori tidak ditemukan', 404);

  const related =
    existing._count.products +
    existing._count.articles +
    existing._count.forumPosts +
    existing._count.rfqs;

  if (related > 0) {
    throw new AppError(
      `Kategori masih dipakai (${existing._count.products} produk, ${existing._count.articles} artikel, ${existing._count.forumPosts} forum, ${existing._count.rfqs} RFQ). Nonaktifkan atau merge terlebih dahulu.`,
      409,
    );
  }

  await prisma.category.delete({ where: { id } });
  await createAuditLog({
    userId: adminId,
    action: 'DELETE_CATEGORY',
    entity: 'CATEGORY',
    entityId: id,
    oldValue: { name: existing.name },
    newValue: reason?.trim() ? { reason: reason.trim() } : undefined,
  });
  void invalidateCategories();
  return { deleted: true, id };
};

export const deactivateCategoryAdmin = async (id: string, adminId: string, reason?: string) => {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new AppError('Kategori tidak ditemukan', 404);

  const updated = await prisma.category.update({
    where: { id },
    data: { isActive: false },
    select: categorySelect,
  });

  await createAuditLog({
    userId: adminId,
    action: 'DEACTIVATE_CATEGORY',
    entity: 'CATEGORY',
    entityId: id,
    oldValue: { isActive: existing.isActive },
    newValue: { isActive: false, reason: reason ?? null },
  });
  void invalidateCategories();
  return updated;
};

export const activateCategoryAdmin = async (id: string, adminId: string) => {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new AppError('Kategori tidak ditemukan', 404);

  const updated = await prisma.category.update({
    where: { id },
    data: { isActive: true },
    select: categorySelect,
  });

  await createAuditLog({
    userId: adminId,
    action: 'ACTIVATE_CATEGORY',
    entity: 'CATEGORY',
    entityId: id,
    oldValue: { isActive: existing.isActive },
    newValue: { isActive: true },
  });
  void invalidateCategories();
  return updated;
};

export const mergeCategoryAdmin = async (
  sourceId: string,
  targetId: string,
  adminId: string,
  reason?: string,
) => {
  if (sourceId === targetId) {
    throw new AppError('Kategori sumber dan tujuan tidak boleh sama', 400);
  }

  const [source, target] = await Promise.all([
    prisma.category.findUnique({ where: { id: sourceId }, select: categorySelect }),
    prisma.category.findUnique({ where: { id: targetId }, select: categorySelect }),
  ]);
  if (!source) throw new AppError('Kategori sumber tidak ditemukan', 404);
  if (!target) throw new AppError('Kategori tujuan tidak ditemukan', 404);
  if (!target.isActive) throw new AppError('Kategori tujuan nonaktif', 400);

  const result = await prisma.$transaction(async (tx) => {
    const products = await tx.product.updateMany({
      where: { categoryId: sourceId },
      data: { categoryId: targetId },
    });
    const articles = await tx.article.updateMany({
      where: { categoryId: sourceId },
      data: { categoryId: targetId },
    });
    const forumPosts = await tx.forumPost.updateMany({
      where: { categoryId: sourceId },
      data: { categoryId: targetId },
    });
    const rfqs = await tx.rfq.updateMany({
      where: { categoryId: sourceId },
      data: { categoryId: targetId },
    });

    await tx.category.update({
      where: { id: sourceId },
      data: { isActive: false },
    });

    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: 'MERGE_CATEGORY',
        entity: 'CATEGORY',
        entityId: sourceId,
        oldValue: { sourceId, sourceName: source.name },
        newValue: {
          targetId,
          targetName: target.name,
          moved: {
            products: products.count,
            articles: articles.count,
            forumPosts: forumPosts.count,
            rfqs: rfqs.count,
          },
          reason: reason ?? null,
        },
      },
    });

    return {
      source: { ...source, isActive: false },
      target,
      moved: {
        products: products.count,
        articles: articles.count,
        forumPosts: forumPosts.count,
        rfqs: rfqs.count,
      },
    };
  });

  void invalidateCategories();
  return result;
};

/* -------------------------------------------------------------------------- */
/* Policies                                                                   */
/* -------------------------------------------------------------------------- */

const policySelect = {
  id: true,
  title: true,
  content: true,
  version: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function snapshotPolicyRevision(
  policy: { id: string; title: string; content: string; version: string; isActive: boolean },
  adminId: string,
  note?: string,
  isPublished = false,
) {
  return prisma.policyRevision.create({
    data: {
      policyId: policy.id,
      title: policy.title,
      content: policy.content,
      version: policy.version,
      isPublished: isPublished || policy.isActive,
      createdById: adminId,
      note: note ?? null,
    },
  });
}

export const createPolicyAdmin = async (
  data: {
    title: string;
    content: string;
    version?: string;
    isActive?: boolean;
    note?: string;
  },
  adminId: string,
) => {
  const existing = await prisma.policy.findUnique({ where: { title: data.title } });
  if (existing) throw new AppError('Judul kebijakan sudah dipakai', 409);

  const policy = await prisma.policy.create({
    data: {
      title: data.title,
      content: data.content,
      version: data.version ?? '1.0.0',
      isActive: data.isActive ?? false,
    },
    select: policySelect,
  });

  await snapshotPolicyRevision(policy, adminId, data.note, policy.isActive);
  await createAuditLog({
    userId: adminId,
    action: 'CREATE_POLICY',
    entity: 'POLICY',
    entityId: policy.id,
    newValue: { title: policy.title, version: policy.version, isActive: policy.isActive },
  });
  void invalidatePolicies();
  return policy;
};

export const createPolicyRevisionAdmin = async (
  policyId: string,
  data: { content: string; version: string; note?: string; publish?: boolean },
  adminId: string,
) => {
  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy) throw new AppError('Kebijakan tidak ditemukan', 404);

  // Always snapshot current published content before mutating
  if (policy.isActive) {
    await snapshotPolicyRevision(policy, adminId, 'Auto-snapshot sebelum revisi', true);
  }

  const updated = await prisma.policy.update({
    where: { id: policyId },
    data: {
      content: data.content,
      version: data.version,
      ...(data.publish !== undefined && { isActive: data.publish }),
    },
    select: policySelect,
  });

  const revision = await snapshotPolicyRevision(
    updated,
    adminId,
    data.note,
    data.publish ?? updated.isActive,
  );

  await createAuditLog({
    userId: adminId,
    action: 'CREATE_POLICY_REVISION',
    entity: 'POLICY',
    entityId: policyId,
    oldValue: { version: policy.version, isActive: policy.isActive },
    newValue: { version: updated.version, isActive: updated.isActive, revisionId: revision.id },
  });
  void invalidatePolicies();
  return { policy: updated, revision };
};

export const publishPolicyAdmin = async (
  policyId: string,
  publish: boolean,
  adminId: string,
  note?: string,
) => {
  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy) throw new AppError('Kebijakan tidak ditemukan', 404);

  if (!publish && policy.isActive) {
    await snapshotPolicyRevision(policy, adminId, note ?? 'Unpublish', true);
  }

  const updated = await prisma.policy.update({
    where: { id: policyId },
    data: { isActive: publish },
    select: policySelect,
  });

  if (publish) {
    await snapshotPolicyRevision(updated, adminId, note ?? 'Publish', true);
  }

  await createAuditLog({
    userId: adminId,
    action: publish ? 'PUBLISH_POLICY' : 'UNPUBLISH_POLICY',
    entity: 'POLICY',
    entityId: policyId,
    oldValue: { isActive: policy.isActive },
    newValue: { isActive: publish, note: note ?? null },
  });
  void invalidatePolicies();
  return updated;
};

export const previewPolicyAdmin = async (policyId: string) => {
  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
    select: {
      ...policySelect,
      revisions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, version: true, createdAt: true, isPublished: true },
      },
    },
  });
  if (!policy) throw new AppError('Kebijakan tidak ditemukan', 404);
  return {
    ...policy,
    previewHtml: `<article><h1>${escapeHtml(policy.title)}</h1><p class="meta">v${escapeHtml(policy.version)} · ${policy.isActive ? 'Published' : 'Draft'}</p><div class="body">${escapeHtml(policy.content).replace(/\n/g, '<br/>')}</div></article>`,
    latestRevision: policy.revisions[0] ?? null,
    revisions: undefined,
  };
};

export const listPolicyRevisionsAdmin = async (policyId: string) => {
  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
    select: { id: true, title: true },
  });
  if (!policy) throw new AppError('Kebijakan tidak ditemukan', 404);

  const revisions = await prisma.policyRevision.findMany({
    where: { policyId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      version: true,
      title: true,
      content: true,
      isPublished: true,
      note: true,
      createdById: true,
      createdAt: true,
    },
  });
  return { policy, revisions };
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* -------------------------------------------------------------------------- */
/* Forum groups                                                               */
/* -------------------------------------------------------------------------- */

const slugBase = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'grup';

const uniqueSlug = async (name: string) => {
  const base = slugBase(name);
  let slug = base;
  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await prisma.forumGroup.findUnique({ where: { slug } });
    if (!exists) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
};

const mapAdminGroup = (group: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  isPublic: boolean;
  isActive: boolean;
  memberCount: number;
  createdAt: Date;
  owner: { id: string; fullName: string; avatarUrl: string | null };
  _count?: { posts: number };
}) => ({
  id: group.id,
  name: group.name,
  slug: group.slug,
  description: group.description,
  avatarUrl: resolveMediaField(group.avatarUrl),
  bannerUrl: resolveMediaField(group.bannerUrl),
  isPublic: group.isPublic,
  isActive: group.isActive,
  memberCount: group.memberCount,
  postCount: group._count?.posts ?? 0,
  createdAt: group.createdAt,
  owner: {
    ...group.owner,
    avatarUrl: resolveMediaField(group.owner.avatarUrl),
  },
});

export const createForumGroupAdmin = async (
  data: {
    name: string;
    description?: string;
    isPublic?: boolean;
    isActive?: boolean;
    ownerId?: string;
    avatarUrl?: string;
    bannerUrl?: string;
  },
  adminId: string,
) => {
  const ownerId = data.ownerId ?? adminId;
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!owner) throw new AppError('Owner tidak ditemukan', 404);

  const slug = await uniqueSlug(data.name);
  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.forumGroup.create({
      data: {
        name: data.name,
        slug,
        description: data.description ?? null,
        isPublic: data.isPublic ?? true,
        isActive: data.isActive ?? true,
        ownerId,
        avatarUrl: data.avatarUrl ?? null,
        bannerUrl: data.bannerUrl ?? null,
        memberCount: 1,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        avatarUrl: true,
        bannerUrl: true,
        isPublic: true,
        isActive: true,
        memberCount: true,
        createdAt: true,
        owner: { select: { id: true, fullName: true, avatarUrl: true } },
        _count: { select: { posts: true } },
      },
    });
    await tx.forumGroupMember.create({
      data: { groupId: created.id, userId: ownerId, role: 'OWNER' },
    });
    return created;
  });

  await createAuditLog({
    userId: adminId,
    action: 'CREATE_FORUM_GROUP',
    entity: 'FORUM_GROUP',
    entityId: group.id,
    newValue: { name: group.name, slug: group.slug },
  });
  return mapAdminGroup(group);
};

export const updateForumGroupAdmin = async (
  groupId: string,
  data: {
    name?: string;
    description?: string | null;
    isPublic?: boolean;
    isActive?: boolean;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
  },
  adminId: string,
) => {
  const existing = await prisma.forumGroup.findUnique({ where: { id: groupId } });
  if (!existing) throw new AppError('Grup forum tidak ditemukan', 404);

  const updated = await prisma.forumGroup.update({
    where: { id: groupId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      avatarUrl: true,
      bannerUrl: true,
      isPublic: true,
      isActive: true,
      memberCount: true,
      createdAt: true,
      owner: { select: { id: true, fullName: true, avatarUrl: true } },
      _count: { select: { posts: true } },
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_FORUM_GROUP',
    entity: 'FORUM_GROUP',
    entityId: groupId,
    newValue: data as Prisma.InputJsonValue,
  });
  return mapAdminGroup(updated);
};

export const deleteForumGroupAdmin = async (groupId: string, adminId: string) => {
  const existing = await prisma.forumGroup.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, _count: { select: { posts: true } } },
  });
  if (!existing) throw new AppError('Grup forum tidak ditemukan', 404);
  if (existing._count.posts > 0) {
    throw new AppError(
      `Grup masih punya ${existing._count.posts} post. Pindahkan atau arsipkan post, lalu nonaktifkan grup.`,
      409,
    );
  }

  await prisma.forumGroup.delete({ where: { id: groupId } });
  await createAuditLog({
    userId: adminId,
    action: 'DELETE_FORUM_GROUP',
    entity: 'FORUM_GROUP',
    entityId: groupId,
    oldValue: { name: existing.name },
  });
  return { deleted: true, id: groupId };
};

export const listForumGroupModerators = async (groupId: string) => {
  const group = await prisma.forumGroup.findUnique({
    where: { id: groupId },
    select: { id: true },
  });
  if (!group) throw new AppError('Grup forum tidak ditemukan', 404);

  const members = await prisma.forumGroupMember.findMany({
    where: { groupId, role: { in: ['OWNER', 'ADMIN'] } },
    select: {
      id: true,
      role: true,
      joinedAt: true,
      user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
    },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
  });

  return members.map((m) => ({
    ...m,
    user: { ...m.user, avatarUrl: resolveMediaField(m.user.avatarUrl) },
  }));
};

export const addForumGroupModerator = async (
  groupId: string,
  userId: string,
  adminId: string,
  role: 'ADMIN' | 'MEMBER' = 'ADMIN',
) => {
  const group = await prisma.forumGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new AppError('Grup forum tidak ditemukan', 404);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError('User tidak ditemukan', 404);

  const member = await prisma.forumGroupMember.upsert({
    where: { groupId_userId: { groupId, userId } },
    create: { groupId, userId, role },
    update: { role },
    select: {
      id: true,
      role: true,
      joinedAt: true,
      user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
    },
  });

  if (role === 'ADMIN' || role === 'MEMBER') {
    const count = await prisma.forumGroupMember.count({ where: { groupId } });
    await prisma.forumGroup.update({ where: { id: groupId }, data: { memberCount: count } });
  }

  await createAuditLog({
    userId: adminId,
    action: 'SET_FORUM_MODERATOR',
    entity: 'FORUM_GROUP',
    entityId: groupId,
    newValue: { userId, role },
  });

  return {
    ...member,
    user: { ...member.user, avatarUrl: resolveMediaField(member.user.avatarUrl) },
  };
};

export const removeForumGroupModerator = async (
  groupId: string,
  userId: string,
  adminId: string,
) => {
  const member = await prisma.forumGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!member) throw new AppError('Anggota tidak ditemukan', 404);
  if (member.role === 'OWNER') {
    throw new AppError('Owner grup tidak dapat dihapus sebagai moderator', 400);
  }

  await prisma.forumGroupMember.update({
    where: { groupId_userId: { groupId, userId } },
    data: { role: 'MEMBER' },
  });

  await createAuditLog({
    userId: adminId,
    action: 'REMOVE_FORUM_MODERATOR',
    entity: 'FORUM_GROUP',
    entityId: groupId,
    newValue: { userId },
  });
  return { removed: true, userId };
};

export const moveForumPostAdmin = async (
  postId: string,
  data: { groupId: string | null; status?: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'; reason?: string },
  adminId: string,
) => {
  const post = await prisma.forumPost.findUnique({
    where: { id: postId },
    select: { id: true, groupId: true, status: true, title: true },
  });
  if (!post) throw new AppError('Posting forum tidak ditemukan', 404);

  if (data.groupId) {
    const group = await prisma.forumGroup.findUnique({
      where: { id: data.groupId },
      select: { id: true, isActive: true },
    });
    if (!group || !group.isActive) {
      throw new AppError('Grup tujuan tidak ditemukan atau nonaktif', 400);
    }
  }

  const updated = await prisma.forumPost.update({
    where: { id: postId },
    data: {
      groupId: data.groupId,
      ...(data.status !== undefined && { status: data.status }),
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'MOVE_FORUM_POST',
    entity: 'FORUM_POST',
    entityId: postId,
    oldValue: { groupId: post.groupId, status: post.status },
    newValue: {
      groupId: data.groupId,
      status: data.status ?? post.status,
      reason: data.reason ?? null,
    },
  });
  return updated;
};

/* -------------------------------------------------------------------------- */
/* Partnerships                                                               */
/* -------------------------------------------------------------------------- */

export const approvePartnershipAdmin = async (
  partnershipId: string,
  adminId: string,
  reason: string,
  note?: string,
) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({ where: { id: partnershipId } });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan', 404);

  if (
    row.status !== PartnershipStatus.PENDING &&
    row.status !== PartnershipStatus.RENEWAL_PENDING
  ) {
    throw new AppError(`Status ${row.status} tidak dapat di-approve admin`, 400);
  }

  const nextStatus =
    row.status === PartnershipStatus.RENEWAL_PENDING
      ? PartnershipStatus.ACTIVE
      : PartnershipStatus.AWAITING_SIGNATURE;

  const updated = await prisma.buyerSupplierPartnership.update({
    where: { id: partnershipId },
    data: {
      status: nextStatus,
      ...(note !== undefined && { internalNotes: appendNote(row.internalNotes, note, adminId) }),
      ...(row.status === PartnershipStatus.RENEWAL_PENDING &&
        row.renewalProposedEndDate && {
          endDate: row.renewalProposedEndDate,
          renewalCount: { increment: 1 },
          renewalProposedEndDate: null,
          renewalRequestedBy: null,
          renewalRequestedAt: null,
          renewalNote: null,
        }),
    },
    include: {
      buyer: {
        select: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          verification: { select: { isVerified: true } },
          profile: { select: { companyName: true, businessType: true } },
        },
      },
      supplier: {
        select: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          verification: { select: { isVerified: true } },
          profile: { select: { companyName: true, businessType: true } },
        },
      },
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'APPROVE_PARTNERSHIP',
    entity: 'PARTNERSHIP',
    entityId: partnershipId,
    oldValue: { status: row.status },
    newValue: { status: nextStatus, reason },
  });

  for (const uid of [row.buyerId, row.supplierId]) {
    void createNotification({
      userId: uid,
      title: 'Kerjasama Disetujui Admin',
      body: `Kontrak "${row.title}" disetujui. Alasan: ${reason}`,
      type: NotificationType.PARTNERSHIP,
      refId: partnershipId,
    });
  }

  return updated;
};

export const rejectPartnershipAdmin = async (
  partnershipId: string,
  adminId: string,
  reason: string,
  note?: string,
) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({ where: { id: partnershipId } });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan', 404);

  const rejectable: PartnershipStatus[] = [
    PartnershipStatus.PENDING,
    PartnershipStatus.AWAITING_SIGNATURE,
    PartnershipStatus.RENEWAL_PENDING,
  ];
  if (!rejectable.includes(row.status)) {
    throw new AppError(`Status ${row.status} tidak dapat ditolak`, 400);
  }

  const updated = await prisma.buyerSupplierPartnership.update({
    where: { id: partnershipId },
    data: {
      status: PartnershipStatus.REJECTED,
      rejectionReason: reason,
      ...(note !== undefined && { internalNotes: appendNote(row.internalNotes, note, adminId) }),
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'REJECT_PARTNERSHIP',
    entity: 'PARTNERSHIP',
    entityId: partnershipId,
    oldValue: { status: row.status },
    newValue: { status: PartnershipStatus.REJECTED, reason },
  });

  for (const uid of [row.buyerId, row.supplierId]) {
    void createNotification({
      userId: uid,
      title: 'Kerjasama Ditolak Admin',
      body: `Kontrak "${row.title}" ditolak. Alasan: ${reason}`,
      type: NotificationType.PARTNERSHIP,
      refId: partnershipId,
    });
  }

  return updated;
};

export const cancelPartnershipAdmin = async (
  partnershipId: string,
  adminId: string,
  reason: string,
) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({ where: { id: partnershipId } });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan', 404);

  const cancellable: PartnershipStatus[] = [
    PartnershipStatus.PENDING,
    PartnershipStatus.AWAITING_SIGNATURE,
    PartnershipStatus.ACTIVE,
    PartnershipStatus.RENEWAL_PENDING,
  ];
  if (!cancellable.includes(row.status)) {
    throw new AppError(`Status ${row.status} tidak dapat dibatalkan`, 400);
  }

  const updated = await prisma.buyerSupplierPartnership.update({
    where: { id: partnershipId },
    data: {
      status: PartnershipStatus.TERMINATED,
      terminatedAt: new Date(),
      terminatedBy: adminId,
      rejectionReason: reason,
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'CANCEL_PARTNERSHIP',
    entity: 'PARTNERSHIP',
    entityId: partnershipId,
    oldValue: { status: row.status },
    newValue: { status: PartnershipStatus.TERMINATED, reason },
  });

  return updated;
};

export const updatePartnershipNotesAdmin = async (
  partnershipId: string,
  internalNotes: string,
  adminId: string,
) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({ where: { id: partnershipId } });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan', 404);

  const updated = await prisma.buyerSupplierPartnership.update({
    where: { id: partnershipId },
    data: { internalNotes },
    select: {
      id: true,
      internalNotes: true,
      status: true,
      updatedAt: true,
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_PARTNERSHIP_NOTES',
    entity: 'PARTNERSHIP',
    entityId: partnershipId,
    newValue: { noteLength: internalNotes.length },
  });
  return updated;
};

export const getPartnershipStatusHistory = async (partnershipId: string) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({
    where: { id: partnershipId },
    select: { id: true, status: true, createdAt: true, contractNumber: true },
  });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan', 404);

  const logs = await prisma.auditLog.findMany({
    where: { entity: 'PARTNERSHIP', entityId: partnershipId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      action: true,
      oldValue: true,
      newValue: true,
      createdAt: true,
      user: { select: { id: true, fullName: true, email: true } },
    },
  });

  return {
    partnership: row,
    history: [
      {
        id: `created-${row.id}`,
        action: 'PARTNERSHIP_CREATED',
        at: row.createdAt,
        actor: null,
        oldValue: null,
        newValue: { status: PartnershipStatus.PENDING, contractNumber: row.contractNumber },
      },
      ...logs.map((l) => ({
        id: l.id,
        action: l.action,
        at: l.createdAt,
        actor: l.user,
        oldValue: l.oldValue,
        newValue: l.newValue,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
  };
};

export const downloadPartnershipDocument = async (partnershipId: string) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({
    where: { id: partnershipId },
    include: {
      buyer: {
        select: {
          id: true,
          fullName: true,
          email: true,
          profile: { select: { companyName: true } },
        },
      },
      supplier: {
        select: {
          id: true,
          fullName: true,
          email: true,
          profile: { select: { companyName: true } },
        },
      },
    },
  });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan', 404);

  const document = {
    contractNumber: row.contractNumber,
    title: row.title,
    status: row.status,
    tier: row.tier,
    description: row.description,
    productCategory: row.productCategory,
    estimatedMonthlyQty: row.estimatedMonthlyQty ? Number(row.estimatedMonthlyQty) : null,
    priceAgreement: row.priceAgreement,
    deliveryTerms: row.deliveryTerms,
    paymentTerms: row.paymentTerms,
    specialTerms: row.specialTerms,
    startDate: row.startDate,
    endDate: row.endDate,
    parties: {
      buyer: {
        id: row.buyer.id,
        fullName: row.buyer.fullName,
        email: row.buyer.email,
        companyName: row.buyer.profile?.companyName ?? null,
      },
      supplier: {
        id: row.supplier.id,
        fullName: row.supplier.fullName,
        email: row.supplier.email,
        companyName: row.supplier.profile?.companyName ?? null,
      },
    },
    signatures: {
      buyerSignedAt: row.buyerSignedAt,
      sellerSignedAt: row.sellerSignedAt,
      platformSignedAt: row.platformSignedAt,
      buyerSignerName: row.buyerSignerName,
      sellerSignerName: row.sellerSignerName,
      platformSignerName: row.platformSignerName,
      isFullySigned: row.isFullySigned,
    },
    exportedAt: new Date().toISOString(),
  };

  return {
    filename: `${row.contractNumber}.json`,
    contentType: 'application/json',
    body: JSON.stringify(document, null, 2),
    document,
  };
};

function appendNote(existing: string | null, note: string, adminId: string) {
  const stamp = new Date().toISOString();
  const line = `[${stamp} admin:${adminId}] ${note}`;
  return existing ? `${existing}\n${line}` : line;
}

/* -------------------------------------------------------------------------- */
/* Market                                                                     */
/* -------------------------------------------------------------------------- */

export const listMarketTrendsCrud = async (params: {
  page: number;
  limit: number;
  category?: TrendCategory;
  region?: string;
  isPublished?: boolean;
  search?: string;
}) => {
  const { page, limit, category, region, isPublished, search } = params;
  const skip = (page - 1) * limit;
  const where: Prisma.MarketTrendWhereInput = {
    ...(category && { category }),
    ...(region && { region }),
    ...(isPublished !== undefined && { isPublished }),
    ...(search && {
      OR: [
        { label: { contains: search } },
        { commodity: { contains: search } },
        { source: { contains: search } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.marketTrend.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.marketTrend.count({ where }),
  ]);

  return { items, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

export const createMarketTrendAdmin = async (
  data: {
    label: string;
    currentValue: string;
    trendType: TrendType;
    category: TrendCategory;
    historyData?: number[];
    period?: string;
    region?: string;
    commodity?: string;
    source?: string;
    isPublished?: boolean;
  },
  adminId: string,
) => {
  const created = await prisma.marketTrend.create({
    data: {
      label: data.label,
      currentValue: data.currentValue,
      trendType: data.trendType,
      category: data.category,
      historyData: data.historyData ?? [],
      period: data.period ?? null,
      region: data.region ?? null,
      commodity: data.commodity ?? null,
      source: data.source ?? null,
      isPublished: data.isPublished ?? true,
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'CREATE_MARKET_TREND',
    entity: 'MARKET_TREND',
    entityId: created.id,
    newValue: { label: created.label, category: created.category },
  });
  return created;
};

export const updateMarketTrendAdmin = async (
  id: string,
  data: Partial<{
    label: string;
    currentValue: string;
    trendType: TrendType;
    category: TrendCategory;
    historyData: number[];
    period: string | null;
    region: string | null;
    commodity: string | null;
    source: string | null;
    isPublished: boolean;
  }>,
  adminId: string,
) => {
  const existing = await prisma.marketTrend.findUnique({ where: { id } });
  if (!existing) throw new AppError('Tren pasar tidak ditemukan', 404);

  const updated = await prisma.marketTrend.update({
    where: { id },
    data: {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.currentValue !== undefined && { currentValue: data.currentValue }),
      ...(data.trendType !== undefined && { trendType: data.trendType }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.historyData !== undefined && { historyData: data.historyData }),
      ...(data.period !== undefined && { period: data.period }),
      ...(data.region !== undefined && { region: data.region }),
      ...(data.commodity !== undefined && { commodity: data.commodity }),
      ...(data.source !== undefined && { source: data.source }),
      ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_MARKET_TREND',
    entity: 'MARKET_TREND',
    entityId: id,
    newValue: data as Prisma.InputJsonValue,
  });
  return updated;
};

export const deleteMarketTrendAdmin = async (id: string, adminId: string) => {
  const existing = await prisma.marketTrend.findUnique({ where: { id } });
  if (!existing) throw new AppError('Tren pasar tidak ditemukan', 404);
  await prisma.marketTrend.delete({ where: { id } });
  await createAuditLog({
    userId: adminId,
    action: 'DELETE_MARKET_TREND',
    entity: 'MARKET_TREND',
    entityId: id,
    oldValue: { label: existing.label },
  });
  return { deleted: true, id };
};

export const listSupplyDemandAdmin = async (params: {
  page: number;
  limit: number;
  category?: string;
  region?: string;
  isPublished?: boolean;
  search?: string;
}) => {
  const { page, limit, category, region, isPublished, search } = params;
  const skip = (page - 1) * limit;
  const where: Prisma.MarketSupplyDemandSnapshotWhereInput = {
    ...(category && { category }),
    ...(region && { region }),
    ...(isPublished !== undefined && { isPublished }),
    ...(search && {
      OR: [{ label: { contains: search } }, { source: { contains: search } }],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.marketSupplyDemandSnapshot.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.marketSupplyDemandSnapshot.count({ where }),
  ]);

  return {
    items: items.map((i) => ({
      ...i,
      totalStockTon: Number(i.totalStockTon),
      quantityTon90d: Number(i.quantityTon90d),
      supplyDemandRatio: i.supplyDemandRatio != null ? Number(i.supplyDemandRatio) : null,
    })),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const createSupplyDemandAdmin = async (
  data: {
    label: string;
    category?: string;
    biomassaType?: string | null;
    grade?: string | null;
    productCount?: number;
    listingCount?: number;
    totalStockKg?: number;
    totalStockTon?: number;
    provinceCount?: number;
    orderCount30d?: number;
    orderCount90d?: number;
    openOrderCount?: number;
    quantityKg30d?: number;
    quantityKg90d?: number;
    quantityTon90d?: number;
    completedQuantityKg90d?: number;
    supplyDemandRatio?: number | null;
    balance?: string;
    period?: string;
    region?: string;
    source?: string;
    isPublished?: boolean;
  },
  adminId: string,
) => {
  const existing = await prisma.marketSupplyDemandSnapshot.findUnique({
    where: { label: data.label },
  });
  if (existing) throw new AppError('Label snapshot sudah dipakai', 409);

  const created = await prisma.marketSupplyDemandSnapshot.create({
    data: {
      label: data.label,
      category: data.category ?? 'BIOMASSA',
      biomassaType: data.biomassaType ?? null,
      grade: data.grade ?? null,
      productCount: data.productCount ?? 0,
      listingCount: data.listingCount ?? 0,
      totalStockKg: data.totalStockKg ?? 0,
      totalStockTon: data.totalStockTon ?? 0,
      provinceCount: data.provinceCount ?? 0,
      orderCount30d: data.orderCount30d ?? 0,
      orderCount90d: data.orderCount90d ?? 0,
      openOrderCount: data.openOrderCount ?? 0,
      quantityKg30d: data.quantityKg30d ?? 0,
      quantityKg90d: data.quantityKg90d ?? 0,
      quantityTon90d: data.quantityTon90d ?? 0,
      completedQuantityKg90d: data.completedQuantityKg90d ?? 0,
      supplyDemandRatio: data.supplyDemandRatio ?? null,
      balance: data.balance ?? 'unknown',
      period: data.period ?? null,
      region: data.region ?? null,
      source: data.source ?? null,
      isPublished: data.isPublished ?? true,
      computedAt: new Date(),
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'CREATE_SUPPLY_DEMAND',
    entity: 'MARKET_SUPPLY_DEMAND',
    entityId: created.id,
    newValue: { label: created.label },
  });
  return created;
};

export const updateSupplyDemandAdmin = async (
  id: string,
  data: Record<string, unknown>,
  adminId: string,
) => {
  const existing = await prisma.marketSupplyDemandSnapshot.findUnique({ where: { id } });
  if (!existing) throw new AppError('Snapshot supply-demand tidak ditemukan', 404);

  const updated = await prisma.marketSupplyDemandSnapshot.update({
    where: { id },
    data: {
      ...(data.label !== undefined && { label: data.label as string }),
      ...(data.category !== undefined && { category: data.category as string }),
      ...(data.biomassaType !== undefined && { biomassaType: data.biomassaType as string | null }),
      ...(data.grade !== undefined && { grade: data.grade as string | null }),
      ...(data.productCount !== undefined && { productCount: data.productCount as number }),
      ...(data.listingCount !== undefined && { listingCount: data.listingCount as number }),
      ...(data.totalStockKg !== undefined && { totalStockKg: data.totalStockKg as number }),
      ...(data.totalStockTon !== undefined && { totalStockTon: data.totalStockTon as number }),
      ...(data.provinceCount !== undefined && { provinceCount: data.provinceCount as number }),
      ...(data.orderCount30d !== undefined && { orderCount30d: data.orderCount30d as number }),
      ...(data.orderCount90d !== undefined && { orderCount90d: data.orderCount90d as number }),
      ...(data.openOrderCount !== undefined && { openOrderCount: data.openOrderCount as number }),
      ...(data.quantityKg30d !== undefined && { quantityKg30d: data.quantityKg30d as number }),
      ...(data.quantityKg90d !== undefined && { quantityKg90d: data.quantityKg90d as number }),
      ...(data.quantityTon90d !== undefined && { quantityTon90d: data.quantityTon90d as number }),
      ...(data.completedQuantityKg90d !== undefined && {
        completedQuantityKg90d: data.completedQuantityKg90d as number,
      }),
      ...(data.supplyDemandRatio !== undefined && {
        supplyDemandRatio: data.supplyDemandRatio as number | null,
      }),
      ...(data.balance !== undefined && { balance: data.balance as string }),
      ...(data.period !== undefined && { period: data.period as string | null }),
      ...(data.region !== undefined && { region: data.region as string | null }),
      ...(data.source !== undefined && { source: data.source as string | null }),
      ...(data.isPublished !== undefined && { isPublished: data.isPublished as boolean }),
      computedAt: new Date(),
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_SUPPLY_DEMAND',
    entity: 'MARKET_SUPPLY_DEMAND',
    entityId: id,
    newValue: data as Prisma.InputJsonValue,
  });
  return updated;
};

export const deleteSupplyDemandAdmin = async (id: string, adminId: string) => {
  const existing = await prisma.marketSupplyDemandSnapshot.findUnique({ where: { id } });
  if (!existing) throw new AppError('Snapshot supply-demand tidak ditemukan', 404);
  await prisma.marketSupplyDemandSnapshot.delete({ where: { id } });
  await createAuditLog({
    userId: adminId,
    action: 'DELETE_SUPPLY_DEMAND',
    entity: 'MARKET_SUPPLY_DEMAND',
    entityId: id,
    oldValue: { label: existing.label },
  });
  return { deleted: true, id };
};
