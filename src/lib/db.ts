import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

/**
 * Tenant scoping utility:
 * Ensures operations querying tenant-owned resources strictly include restaurantId.
 */
export function createTenantContext(restaurantId: string) {
  if (!restaurantId) {
    throw new Error('Tenant context violation: restaurantId is required');
  }

  return {
    restaurantId,
    articles: {
      findMany: (args?: Parameters<typeof db.article.findMany>[0]) =>
        db.article.findMany({
          ...args,
          where: { ...args?.where, restaurantId },
        }),
      findFirst: (args?: Parameters<typeof db.article.findFirst>[0]) =>
        db.article.findFirst({
          ...args,
          where: { ...args?.where, restaurantId },
        }),
    },
    categories: {
      findMany: (args?: Parameters<typeof db.category.findMany>[0]) =>
        db.category.findMany({
          ...args,
          where: { ...args?.where, restaurantId },
        }),
    },
    orders: {
      findMany: (args?: Parameters<typeof db.order.findMany>[0]) =>
        db.order.findMany({
          ...args,
          where: { ...args?.where, restaurantId },
        }),
    },
  };
}