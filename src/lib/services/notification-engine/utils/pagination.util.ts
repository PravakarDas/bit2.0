export interface NormalizedPagination {
  take: number;
  skip: number;
}

/**
 * Clamps caller-supplied pagination params to sane bounds. Purely mechanical
 * (no query construction, no knowledge of any specific model) — repositories
 * remain the only place that talks to Prisma.
 */
export function normalizePagination(take?: number, skip?: number, maxTake = 100): NormalizedPagination {
  const safeTake = take === undefined ? maxTake : Math.max(1, Math.min(take, maxTake));
  const safeSkip = skip === undefined ? 0 : Math.max(0, skip);
  return { take: safeTake, skip: safeSkip };
}
