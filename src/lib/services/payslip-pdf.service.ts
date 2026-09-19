import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatCurrency, CURRENCY_SYMBOL } from "../currency";
import { applyLetterhead, inspectPdfTemplate, LETTERHEAD_MARGINS } from "../pdf-letterhead";

/**
 * Mirrors the real fields on the `SalaryPayment` Prisma model plus the
 * minimal employee identity needed for the payslip header. Deliberately
 * takes already-computed values (no recalculation) so the PDF can never
 * disagree with the stored payroll record.
 */
export interface PayslipData {
  employeeName: string;
  employeeEmail?: string;
  month: string;
  baseSalary: number;
  totalBonuses: number;
  totalAllowances: number;
  medicalReimbursement: number;
  loanDeduction: number;
  walletAdjustment: number;
  netAmount: number;
  /** One-off bonus already included in `totalBonuses`; shown as its own labelled line. */
  customBonus?: number;
  customBonusNote?: string | null;
}

const COMPANY_NAME = "Bit HR";

/**
 * pdfkit's built-in Helvetica font (PDF standard-14, non-embedded) has no
 * glyph for "৳" (U+09F3, Bengali currency sign) — it renders with zero
 * width, i.e. silently invisible. `formatCurrency()`'s output is used
 * unchanged (never modified to work around this); instead this module
 * bundles a small subset of Noto Sans Bengali (SIL Open Font License 1.1 —
 * see NotoSansBengali-LICENSE.txt) purely to supply that one glyph, and
 * draws each amount as two adjacent same-baseline text runs: the currency
 * symbol in Noto Sans Bengali, the digits/grouping in Helvetica (this
 * particular "bengali" subset has no Latin digit glyphs, so the digits
 * still need Helvetica regardless).
 */
const FONTS_DIR = path.join(process.cwd(), "src/lib/services/assets/fonts");
const BENGALI_REGULAR = fs.readFileSync(path.join(FONTS_DIR, "NotoSansBengali-Regular.woff"));
const BENGALI_BOLD = fs.readFileSync(path.join(FONTS_DIR, "NotoSansBengali-Bold.woff"));

function registerFonts(doc: PDFKit.PDFDocument) {
  doc.registerFont("NotoSansBengali", BENGALI_REGULAR);
  doc.registerFont("NotoSansBengali-Bold", BENGALI_BOLD);
}

/** Splits `formatCurrency()`'s output into its (single-char) symbol and the rest, unchanged otherwise. */
function splitCurrencyParts(formatted: string): { symbol: string; rest: string } {
  return { symbol: formatted.slice(0, CURRENCY_SYMBOL.length), rest: formatted.slice(CURRENCY_SYMBOL.length) };
}

function drawAmountRightAligned(doc: PDFKit.PDFDocument, y: number, amount: number, bold: boolean) {
  const symbolFont = bold ? "NotoSansBengali-Bold" : "NotoSansBengali";
  const digitsFont = bold ? "Helvetica-Bold" : "Helvetica";
  const { symbol, rest } = splitCurrencyParts(formatCurrency(amount));

  doc.font(symbolFont);
  const symbolWidth = doc.widthOfString(symbol);
  doc.font(digitsFont);
  const restWidth = doc.widthOfString(rest);

  const rightEdge = doc.page.width - doc.page.margins.right;
  const startX = rightEdge - symbolWidth - restWidth;

  doc.font(symbolFont).text(symbol, startX, y, { lineBreak: false });
  doc.font(digitsFont).text(rest, startX + symbolWidth, y, { lineBreak: false });

  // Explicit-x .text() calls leave pdfkit's internal cursor at the drawn
  // text's right edge; reset it so the next unpositioned .text() call
  // (e.g. a section header) gets the page's full width, not whatever
  // narrow remainder is left of this right-aligned amount.
  doc.x = doc.page.margins.left;
}

function drawLineItem(doc: PDFKit.PDFDocument, label: string, amount: number) {
  const y = doc.y;
  doc.font("Helvetica").fontSize(10).text(label, doc.page.margins.left, y, { continued: false });
  doc.font("Helvetica").fontSize(10);
  drawAmountRightAligned(doc, y, amount, false);
  // The amount is drawn with explicit coordinates and leaves the cursor on the same line, which made
  // consecutive rows print on top of each other. Always move down one line after a row.
  doc.y = y + doc.currentLineHeight(true);
}

/**
 * Renders a single employee's payslip as a PDF and returns it as a Buffer.
 * Pure: no database access, no email/SMTP, no NotificationJob creation, no
 * mutation of any kind — the caller is responsible for persisting/sending
 * the result.
 */
export async function generatePayslipPdf(
  data: PayslipData,
  options: { letterhead?: Uint8Array | null } = {}
): Promise<Buffer> {
  const letterhead = options.letterhead ?? null;
  if (!letterhead) {
    return renderPayslipContent(data, { size: "A4", margin: 50, compress: false });
  }

  // Branch letterhead: draw the payslip inside the safe body area at the template's own page
  // size, then lay it on top of the template so the logo/footer stay clear.
  const template = await inspectPdfTemplate(letterhead);
  const content = await renderPayslipContent(data, {
    size: [template.width, template.height],
    margins: { ...LETTERHEAD_MARGINS },
    compress: false,
  });
  return applyLetterhead(content, letterhead);
}

function renderPayslipContent(data: PayslipData, documentOptions: PDFKit.PDFDocumentOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument(documentOptions);
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    registerFonts(doc);

    doc.font("Helvetica-Bold").fontSize(18).text(COMPANY_NAME, { align: "left" });
    doc.font("Helvetica").fontSize(12).fillColor("#555555").text("Payslip", { align: "left" });
    doc.fillColor("#000000");
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(11).text("Employee");
    doc.font("Helvetica").fontSize(10).text(data.employeeName);
    if (data.employeeEmail) {
      doc.text(data.employeeEmail);
    }
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(11).text("Pay Period");
    doc.font("Helvetica").fontSize(10).text(data.month);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text("Earnings");
    doc.moveDown(0.3);
    drawLineItem(doc, "Base Salary", data.baseSalary);
    doc.moveDown(0.3);
    drawLineItem(doc, "Bonuses", data.totalBonuses);
    if (data.customBonus && data.customBonus > 0) {
      doc.moveDown(0.3);
      drawLineItem(doc, `   incl. ${data.customBonusNote?.trim() || "Custom bonus"}`, data.customBonus);
    }
    doc.moveDown(0.3);
    drawLineItem(doc, "Allowances", data.totalAllowances);
    doc.moveDown(0.3);
    drawLineItem(doc, "Medical Reimbursement", data.medicalReimbursement);
    doc.moveDown(0.3);
    drawLineItem(doc, "Wallet Adjustment", data.walletAdjustment);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text("Deductions");
    doc.moveDown(0.3);
    drawLineItem(doc, "Loan Deduction", data.loanDeduction);
    doc.moveDown(1);

    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor("#cccccc")
      .stroke();
    doc.moveDown(0.5);

    const netY = doc.y;
    doc.font("Helvetica-Bold").fontSize(13).text("Net Salary", doc.page.margins.left, netY);
    doc.font("Helvetica-Bold").fontSize(13);
    drawAmountRightAligned(doc, netY, data.netAmount, true);

    doc.end();
  });
}
