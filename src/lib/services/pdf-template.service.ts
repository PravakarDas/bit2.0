import { prisma } from "@/lib/prisma";

/**
 * Resolves the letterhead template to use for a branch: the branch's own template if it has
 * one, otherwise the shared "Default" template, otherwise none (plain design).
 * Loads everything needed for a whole payroll run in one query instead of one per employee.
 */
export async function loadLetterheadResolver(branchIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(branchIds.filter((id): id is string => !!id)));

  const rows = await prisma.pdfTemplate.findMany({
    where: { OR: [{ branchId: null }, ...(ids.length > 0 ? [{ branchId: { in: ids } }] : [])] },
    select: { branchId: true, data: true },
  });

  const byBranch = new Map<string, Uint8Array>();
  let fallback: Uint8Array | null = null;
  for (const row of rows) {
    if (row.branchId) byBranch.set(row.branchId, row.data);
    else fallback = row.data;
  }

  return (branchId: string | null | undefined): Uint8Array | null =>
    (branchId ? byBranch.get(branchId) : undefined) ?? fallback;
}
