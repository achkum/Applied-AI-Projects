import type { Prisma } from '@prisma/client';

export interface RequestContext {
  userId: string;
}

type TransactionClient = Prisma.TransactionClient;
type TransactionRunner = {
  $transaction<T>(
    operation: (transaction: TransactionClient) => Promise<T>,
  ): Promise<T>;
};

export async function withRequestTransaction<T>(
  prisma: TransactionRunner,
  context: RequestContext,
  operation: (transaction: TransactionClient) => Promise<T>,
): Promise<T> {
  if (!context.userId.trim())
    throw new Error('Authenticated request context is required');
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.user_id', ${context.userId}, true)`;
    return operation(transaction);
  });
}
