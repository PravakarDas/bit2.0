/**
 * Prisma's unique-constraint-violation error code
 * (https://www.prisma.io/docs/orm/reference/error-reference#p2002).
 */
const PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE = "P2002";

interface PrismaKnownErrorShape {
  code?: string;
  meta?: { target?: string[] };
}

/**
 * Duplicate-detection helper (Design §17/§18). Does not itself decide what
 * to do about a duplicate (that's `QueueEngine.enqueue`'s job) — it only
 * answers "was this failure caused by the `idempotencyKey` unique
 * constraint specifically," so the repository/engine layer can translate a
 * raw Prisma error into a meaningful `DuplicateJobError` instead of a
 * generic `RepositoryError`.
 */
export class IdempotencyGuard {
  static isIdempotencyKeyConflict(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
      return false;
    }
    const prismaError = error as PrismaKnownErrorShape;
    if (prismaError.code !== PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE) {
      return false;
    }
    return prismaError.meta?.target?.includes("idempotencyKey") ?? false;
  }
}
