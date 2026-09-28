"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";
import { inspectPdfTemplate, InvalidPdfTemplateError } from "@/lib/pdf-letterhead";
import { MAX_PDF_TEMPLATE_BYTES } from "@/lib/pdf-letterhead-constants";

// Templates decide how every employee's official PDFs look, so only Admin/HR may manage them.
async function requireTemplateManager() {
  const user = await getDbUser();
  if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
    throw new Error("Unauthorized");
  }
  return user;
}

const templateMetaSelect = {
  id: true,
  branchId: true,
  fileName: true,
  sizeBytes: true,
  pageWidth: true,
  pageHeight: true,
  updatedAt: true,
} as const;

/** Metadata only (never the PDF bytes): the shared default template and one per branch. */
export async function getPdfTemplates() {
  await requireTemplateManager();
  const rows = await prisma.pdfTemplate.findMany({ select: templateMetaSelect });

  return {
    defaultTemplate: rows.find((row) => row.branchId === null) ?? null,
    byBranch: Object.fromEntries(rows.filter((row) => row.branchId).map((row) => [row.branchId as string, row])),
  };
}

/**
 * Upload (or replace) a template. `branchId` empty/"default" targets the shared default.
 * Expects FormData with `file` (PDF, max 5 MB) and `branchId`.
 */
export async function uploadPdfTemplate(formData: FormData) {
  try {
    const user = await requireTemplateManager();

    const file = formData.get("file");
    const rawBranchId = String(formData.get("branchId") ?? "");
    const branchId = rawBranchId && rawBranchId !== "default" ? rawBranchId : null;

    if (!(file instanceof File)) {
      return { success: false, error: "Choose a PDF file to upload." };
    }
    if (file.size > MAX_PDF_TEMPLATE_BYTES) {
      return { success: false, error: "The PDF is larger than 5 MB." };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = await inspectPdfTemplate(bytes);

    if (branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
      if (!branch) {
        return { success: false, error: "Branch not found." };
      }
    }

    const data = {
      fileName: file.name.slice(0, 200) || "template.pdf",
      sizeBytes: bytes.byteLength,
      pageWidth: info.width,
      pageHeight: info.height,
      data: bytes,
      uploadedById: user.id,
    };

    await prisma.$transaction(async (tx) => {
      if (branchId) {
        await tx.pdfTemplate.upsert({
          where: { branchId },
          create: { branchId, ...data },
          update: data,
        });
      } else {
        // branchId is NULL for the shared default, which a unique index cannot enforce: keep a single row here.
        await tx.pdfTemplate.deleteMany({ where: { branchId: null } });
        await tx.pdfTemplate.create({ data: { branchId: null, ...data } });
      }

      await tx.systemAudit.create({
        data: {
          action: "PDF_TEMPLATE_UPLOADED",
          status: "SUCCESS",
          details: `${branchId ? `Branch ${branchId}` : "Default"} PDF template "${data.fileName}" (${data.sizeBytes} bytes) uploaded by ${user.id}`,
        },
      });
    });

    revalidatePath("/admin/organization");
    return {
      success: true,
      message: info.pageCount > 1 ? "Template saved. Only the first page is used." : "Template saved.",
    };
  } catch (error) {
    if (error instanceof InvalidPdfTemplateError) {
      return { success: false, error: error.message };
    }
    console.error("Error uploading PDF template:", error);
    return { success: false, error: "Failed to upload the PDF template." };
  }
}

export async function deletePdfTemplate(templateId: string) {
  try {
    const user = await requireTemplateManager();

    const template = await prisma.pdfTemplate.findUnique({ where: { id: templateId }, select: { id: true, branchId: true, fileName: true } });
    if (!template) {
      return { success: false, error: "Template not found." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.pdfTemplate.delete({ where: { id: templateId } });
      await tx.systemAudit.create({
        data: {
          action: "PDF_TEMPLATE_REMOVED",
          status: "SUCCESS",
          details: `${template.branchId ? `Branch ${template.branchId}` : "Default"} PDF template "${template.fileName}" removed by ${user.id}`,
        },
      });
    });

    revalidatePath("/admin/organization");
    return { success: true };
  } catch (error) {
    console.error("Error removing PDF template:", error);
    return { success: false, error: "Failed to remove the PDF template." };
  }
}
