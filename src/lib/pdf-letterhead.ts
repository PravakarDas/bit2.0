import { PDFDocument } from "pdf-lib";
import { LETTERHEAD_MARGINS, MAX_PDF_TEMPLATE_BYTES } from "./pdf-letterhead-constants";

/**
 * Letterhead support: an uploaded blank PDF "pad" is used as the fixed background of
 * generated PDFs, and dynamic content is only drawn inside a safe body area so it never
 * overlaps the logo (header) or footer. Pure (no database / Next.js), so it is unit-tested.
 */

export { MAX_PDF_TEMPLATE_BYTES, LETTERHEAD_MARGINS };

export interface PdfTemplateInfo {
  pageCount: number;
  /** First page size in points; only this page is used as the background. */
  width: number;
  height: number;
}

export class InvalidPdfTemplateError extends Error {}

/** Validates an uploaded template: real, unencrypted PDF within the size limit. */
export async function inspectPdfTemplate(bytes: Uint8Array): Promise<PdfTemplateInfo> {
  if (bytes.byteLength === 0) {
    throw new InvalidPdfTemplateError("The file is empty.");
  }
  if (bytes.byteLength > MAX_PDF_TEMPLATE_BYTES) {
    throw new InvalidPdfTemplateError("The PDF is larger than 5 MB.");
  }

  // Every real PDF starts with "%PDF-" (allowing a little leading junk, as the spec does).
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  if (!head.includes("%PDF-")) {
    throw new InvalidPdfTemplateError("The file is not a PDF.");
  }

  // pdf-lib parses lazily: a damaged file can load fine and only fail when its pages are read,
  // so every step that touches the document is inside the same guard.
  try {
    const doc = await PDFDocument.load(bytes);
    const pageCount = doc.getPageCount();
    if (pageCount < 1) {
      throw new InvalidPdfTemplateError("The PDF has no pages.");
    }
    const { width, height } = doc.getPage(0).getSize();
    return { pageCount, width, height };
  } catch (error) {
    if (error instanceof InvalidPdfTemplateError) throw error;
    throw new InvalidPdfTemplateError("The PDF could not be read. It may be corrupted or password-protected.");
  }
}

/**
 * Lays each page of `content` on top of the template's first page. `content` must have been
 * generated at the template's page size (see `inspectPdfTemplate`) so both align exactly.
 */
export async function applyLetterhead(content: Uint8Array, template: Uint8Array): Promise<Buffer> {
  const out = await PDFDocument.create();
  const templateDoc = await PDFDocument.load(template);
  const [background] = await out.embedPdf(templateDoc, [0]);

  const contentDoc = await PDFDocument.load(content);
  const contentPages = await out.embedPdf(contentDoc, contentDoc.getPageIndices());

  for (const contentPage of contentPages) {
    const page = out.addPage([background.width, background.height]);
    page.drawPage(background);
    page.drawPage(contentPage);
  }

  return Buffer.from(await out.save());
}
