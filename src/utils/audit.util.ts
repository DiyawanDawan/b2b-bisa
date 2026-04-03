import prisma from '#config/prisma';

export const logAudit = async ({
  userId,
  action,
  entity,
  entityId,
  oldValue,
  newValue,
  ipAddress,
}: {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
}) => {
  try {
    return await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        oldValue,
        newValue,
        ipAddress,
      },
    });
  } catch (error) {
    console.error('Audit Log Error:', error);
  }
};
