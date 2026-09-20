import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatCurrency, CURRENCY_SYMBOL } from "../currency";
import { applyLetterhead, inspectPdfTemplate, LETTERHEAD_MARGINS } from "../pdf-letterhead";

/** One labelled amount on the payslip (a bonus, a loan repayment, ...). */
interface PayslipLine {
  label: string;
  amount: number;
}

/** One wallet entry settled in this payroll, listed on the wallet page. */
interface PayslipWalletEntry {
  date: Date | string;
  description: string;
  /** Positive = credit to the employee, negative = deduction. */
  amount: number;
}

/**
 * Mirrors the real fields on the `SalaryPayment` Prisma model plus the
 * minimal employee identity needed for the payslip header. Deliberately
 * takes already-computed values (no recalculation) so the PDF can never
 * disagree with the stored payroll record.
 */
export interface PayslipData {
  employeeName: string;
  employeeEmail?: string;
  /** e.g. "BTCD1042"; printed as "N/A" when missing. */
  employeeId?: string | null;
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
  /** Allowances paid this month (itemised under "Allowances"). */
  allowanceLines?: PayslipLine[];
  /** Bonus types paid this month (itemised under "Bonuses"). */
  bonusLines?: PayslipLine[];
  /** Loan deductions this month, one line per loan (itemised under "Loan Deduction"). */
  loanLines?: PayslipLine[];
  /**
   * Wallet entries settled in this payroll. When provided (even empty) a wallet page is
   * added after the payslip; when undefined (older payslips) that page is skipped.
   */
  walletTransactions?: PayslipWalletEntry[] | null;
}

const COMPANY_NAME = "Bit HR";
const MUTED = "#666666";
/** Height kept free at the bottom of the content area for the "1 of 3" page number. */
const PAGE_NUMBER_BAND = 26;
const MONEY_TOLERANCE = 0.01;
const APP_TIME_ZONE = "Asia/Dhaka";

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

/** Right-aligned amount; negative amounts are printed as "-৳1,234". */
function drawAmountRightAligned(doc: PDFKit.PDFDocument, y: number, amount: number, bold: boolean) {
  const symbolFont = bold ? "NotoSansBengali-Bold" : "NotoSansBengali";
  const digitsFont = bold ? "Helvetica-Bold" : "Helvetica";
  const negative = amount < -MONEY_TOLERANCE;
  const { symbol, rest } = splitCurrencyParts(formatCurrency(Math.abs(amount)));
  const sign = negative ? "-" : "";

  doc.font(digitsFont);
  const signWidth = doc.widthOfString(sign);
  const restWidth = doc.widthOfString(rest);
  doc.font(symbolFont);
  const symbolWidth = doc.widthOfString(symbol);

  const rightEdge = doc.page.width - doc.page.margins.right;
  const startX = rightEdge - signWidth - symbolWidth - restWidth;

  if (sign) doc.font(digitsFont).text(sign, startX, y, { lineBreak: false });
  doc.font(symbolFont).text(symbol, startX + signWidth, y, { lineBreak: false });
  doc.font(digitsFont).text(rest, startX + signWidth + symbolWidth, y, { lineBreak: false });

  // Explicit-x .text() calls leave pdfkit's internal cursor at the drawn
  // text's right edge; reset it so the next unpositioned .text() call
  // (e.g. a section header) gets the page's full width, not whatever
  // narrow remainder is left of this right-aligned amount.
  doc.x = doc.page.margins.left;
}

/**
 * Free text (bonus names, wallet descriptions) is drawn in Helvetica, which only covers Latin
 * characters. "৳" becomes "Tk"; anything else Helvetica cannot draw becomes "?" instead of garbage.
 */
function pdfSafe(text: string) {
  return text
    .replace(/৳/g, "Tk ")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "?");
}

// ---- layout helpers --------------------------------------------------------

function contentWidth(doc: PDFKit.PDFDocument) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

/** Starts a new page (same margins) when `height` would not fit above the bottom margin. */
function ensureSpace(doc: PDFKit.PDFDocument, height: number, onNewPage?: () => void) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    onNewPage?.();
  }
}

function drawDivider(doc: PDFKit.PDFDocument) {
  ensureSpace(doc, 12);
  const y = doc.y + 3;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(0.7)
    .strokeColor("#cccccc")
    .stroke();
  doc.strokeColor("#000000");
  doc.x = doc.page.margins.left;
  doc.y = y + 9;
}

function drawSectionHeading(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 32); // keep a heading together with at least its first row
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#000000").text(title, doc.page.margins.left, doc.y);
  doc.x = doc.page.margins.left;
  doc.y += 4;
}

/** One line item: label on the left, amount right-aligned. Always moves the cursor to the next line. */
function drawLineItem(
  doc: PDFKit.PDFDocument,
  label: string,
  amount: number,
  options: { indent?: number; muted?: boolean; bold?: boolean } = {}
) {
  const { indent = 0, muted = false, bold = false } = options;
  const size = bold ? 13 : 10;
  ensureSpace(doc, size + 8);

  const y = doc.y;
  doc
    .font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(size)
    .fillColor(muted ? MUTED : "#000000")
    .text(pdfSafe(label), doc.page.margins.left + indent, y, { width: contentWidth(doc) - indent - 110, lineBreak: false });
  drawAmountRightAligned(doc, y, amount, bold);
  doc.fillColor("#000000");

  // The amount is drawn with explicit coordinates and leaves the cursor on the same line, which made
  // consecutive rows print on top of each other. Always move down one line after a row.
  doc.y = y + doc.currentLineHeight(true) + (bold ? 6 : 3.5);
}

/** "Label: value" row of the employee block. */
function drawInfoRow(doc: PDFKit.PDFDocument, label: string, value: string) {
  const y = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(label, doc.page.margins.left, y, { width: 100, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text(value, doc.page.margins.left + 105, y, {
    width: contentWidth(doc) - 105,
    lineBreak: false,
  });
  doc.x = doc.page.margins.left;
  doc.y = y + doc.currentLineHeight(true) + 3;
}

function formatEntryDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

// ---- pages -------------------------------------------------------------------

function drawPayslipPage(doc: PDFKit.PDFDocument, data: PayslipData) {
  doc.font("Helvetica-Bold").fontSize(18).text(COMPANY_NAME, doc.page.margins.left, doc.y, { align: "left" });
  doc.font("Helvetica").fontSize(12).fillColor(MUTED).text("Payslip", { align: "left" });
  doc.fillColor("#000000");
  doc.moveDown(0.8);

  // Employee block
  drawInfoRow(doc, "Employee Name", data.employeeName);
  drawInfoRow(doc, "Employee ID", data.employeeId || "N/A");
  if (data.employeeEmail) {
    drawInfoRow(doc, "Email", data.employeeEmail);
  }
  drawInfoRow(doc, "Pay Period", data.month);
  doc.moveDown(0.3);
  drawDivider(doc);

  // Earnings
  drawSectionHeading(doc, "Earnings");
  drawLineItem(doc, "Base Salary", data.baseSalary);

  drawLineItem(doc, "Bonuses", data.totalBonuses);
  for (const line of data.bonusLines ?? []) {
    drawLineItem(doc, line.label, line.amount, { indent: 14, muted: true });
  }
  if (data.customBonus && data.customBonus > 0) {
    drawLineItem(doc, data.customBonusNote?.trim() || "Custom bonus", data.customBonus, { indent: 14, muted: true });
  }

  drawLineItem(doc, "Allowances", data.totalAllowances);
  for (const line of data.allowanceLines ?? []) {
    drawLineItem(doc, line.label, line.amount, { indent: 14, muted: true });
  }
  drawLineItem(doc, "Medical Reimbursement", data.medicalReimbursement);
  doc.moveDown(0.4);

  // Deductions & adjustments
  drawSectionHeading(doc, "Deductions & Adjustments");
  drawLineItem(doc, "Wallet Adjustment", data.walletAdjustment);

  drawLineItem(doc, "Loan Deduction", -data.loanDeduction);
  for (const line of data.loanLines ?? []) {
    drawLineItem(doc, line.label, -line.amount, { indent: 14, muted: true });
  }
  doc.moveDown(0.3);

  drawDivider(doc);
  drawLineItem(doc, "Net Salary", data.netAmount, { bold: true });
}

function drawWalletPage(doc: PDFKit.PDFDocument, data: PayslipData, entries: PayslipWalletEntry[]) {
  doc.addPage();

  doc.font("Helvetica-Bold").fontSize(14).fillColor("#000000").text("Wallet Transactions", doc.page.margins.left, doc.y);
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(
    `${data.employeeName} · ${data.month}. Wallet entries settled in this payroll; their total is the Wallet Adjustment on the payslip.`,
    doc.page.margins.left,
    doc.y + 2,
    { width: contentWidth(doc) }
  );
  doc.fillColor("#000000");
  doc.moveDown(0.6);
  drawDivider(doc);

  const left = doc.page.margins.left;
  const dateWidth = 68;
  const amountWidth = 100;
  const descX = left + dateWidth + 10;
  const descWidth = contentWidth(doc) - dateWidth - 10 - amountWidth;

  const drawTableHeader = () => {
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED);
    doc.text("Date", left, y, { width: dateWidth, lineBreak: false });
    doc.text("Description", descX, y, { width: descWidth, lineBreak: false });
    doc.text("Amount", descX + descWidth, y, { width: amountWidth, align: "right", lineBreak: false });
    doc.fillColor("#000000");
    doc.x = left;
    doc.y = y + 15;
  };
  drawTableHeader();

  if (entries.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED).text("No wallet transactions in this period.", left, doc.y + 2);
    doc.fillColor("#000000");
    doc.x = left;
    doc.moveDown(0.8);
  }

  const drawEntry = (date: string, rawDescription: string, amount: number, muted = false) => {
    const description = pdfSafe(rawDescription);
    doc.font("Helvetica").fontSize(10);
    const rowHeight = Math.max(doc.heightOfString(description, { width: descWidth }), doc.currentLineHeight(true));
    ensureSpace(doc, rowHeight + 6, drawTableHeader);

    const y = doc.y;
    // drawTableHeader (on a fresh page) leaves a bold 9pt font behind; always restore the row font.
    doc.font("Helvetica").fontSize(10).fillColor(muted ? MUTED : "#000000");
    doc.text(date, left, y, { width: dateWidth, lineBreak: false });
    doc.text(description, descX, y, { width: descWidth });
    drawAmountRightAligned(doc, y, amount, false);
    doc.fillColor("#000000");
    doc.y = y + rowHeight + 5;
  };

  let listed = 0;
  for (const entry of entries) {
    drawEntry(formatEntryDate(entry.date), entry.description, entry.amount);
    listed += entry.amount;
  }

  // Wallet balances are not guaranteed to be the exact sum of their entries (older or seeded
  // balances), so show any difference explicitly: the total below then always matches page 1.
  const other = data.walletAdjustment - listed;
  if (Math.abs(other) > MONEY_TOLERANCE) {
    drawEntry("", "Other adjustments (not itemised)", other, true);
  }

  drawDivider(doc);
  drawLineItem(doc, "Total (Wallet Adjustment)", data.walletAdjustment, { bold: true });
}

/**
 * Writes "n of total" on every page, inside the content area so it never touches a letterhead
 * footer. The payslip and the wallet section are numbered separately (each starts at 1), even
 * though they are one PDF.
 */
function drawPageNumbers(doc: PDFKit.PDFDocument, pageBottomMargin: number, payslipPageCount: number) {
  const { start, count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    const inPayslip = i < payslipPageCount;
    const numberInSection = inPayslip ? i + 1 : i - payslipPageCount + 1;
    const sectionTotal = inPayslip ? payslipPageCount : count - payslipPageCount;

    doc.switchToPage(start + i);
    // Writing below the bottom margin would make pdfkit add a page; lift the margin while drawing.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(`${numberInSection} of ${sectionTotal}`, doc.page.margins.left, doc.page.height - pageBottomMargin - 14, {
        width: contentWidth(doc),
        align: "right",
        lineBreak: false,
      });
    doc.page.margins.bottom = savedBottom;
  }
  doc.fillColor("#000000");
}

/**
 * Renders a single employee's payslip as a PDF and returns it as a Buffer.
 * Pure: no database access, no email/SMTP, no NotificationJob creation, no
 * mutation of any kind — the caller is responsible for persisting/sending
 * the result.
 *
 * Page 1 (and further pages if the line items need them) is the payslip; when wallet
 * entries are supplied a wallet section follows on its own pages. The payslip and the wallet
 * section are each numbered "n of total" separately.
 * With a `letterhead`, the content is drawn inside the safe body area at the template's own
 * page size and laid on top of the template's first page.
 */
export async function generatePayslipPdf(
  data: PayslipData,
  options: { letterhead?: Uint8Array | null } = {}
): Promise<Buffer> {
  const letterhead = options.letterhead ?? null;
  if (!letterhead) {
    return renderPayslipContent(data, { size: "A4", margins: { top: 50, left: 50, right: 50, bottom: 50 } });
  }

  const template = await inspectPdfTemplate(letterhead);
  const content = await renderPayslipContent(data, {
    size: [template.width, template.height],
    margins: { ...LETTERHEAD_MARGINS },
  });
  return applyLetterhead(content, letterhead);
}

function renderPayslipContent(
  data: PayslipData,
  pageOptions: { size: PDFKit.PDFDocumentOptions["size"]; margins: { top: number; left: number; right: number; bottom: number } }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Content stops PAGE_NUMBER_BAND above the page's bottom margin so the page number has its own space.
    const doc = new PDFDocument({
      size: pageOptions.size,
      margins: { ...pageOptions.margins, bottom: pageOptions.margins.bottom + PAGE_NUMBER_BAND },
      bufferPages: true,
      compress: false,
    });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      registerFonts(doc);

      drawPayslipPage(doc, data);
      const payslipPageCount = doc.bufferedPageRange().count;
      if (data.walletTransactions) {
        drawWalletPage(doc, data, data.walletTransactions);
      }
      drawPageNumbers(doc, pageOptions.margins.bottom, payslipPageCount);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
