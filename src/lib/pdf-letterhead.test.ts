import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  applyLetterhead,
  inspectPdfTemplate,
  InvalidPdfTemplateError,
  LETTERHEAD_MARGINS,
  MAX_PDF_TEMPLATE_BYTES,
} from "./pdf-letterhead";
import { generatePayslipPdf } from "./services/payslip-pdf.service";
import type { PayslipData } from "./services/payslip-pdf.service";

const LETTER: [number, number] = [612, 792];

/** A blank "letterhead pad": a logo line in the header and a footer line, like a real one. */
async function makeTemplate(size: [number, number] = LETTER, pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage(size);
    page.drawText(`LETTERHEAD-LOGO-${i + 1}`, { x: 40, y: size[1] - 60, size: 20, font });
    page.drawText("LETTERHEAD-FOOTER", { x: 40, y: 40, size: 10, font });
  }
  return doc.save();
}

function payslip(overrides: Partial<PayslipData> = {}): PayslipData {
  return {
    employeeName: "Jane Doe",
    employeeEmail: "jane.doe@example.com",
    month: "2026-08",
    baseSalary: 50000,
    totalBonuses: 5000,
    totalAllowances: 2000,
    medicalReimbursement: 1000,
    loanDeduction: 3000,
    walletAdjustment: 500,
    netAmount: 55500,
    ...overrides,
  };
}

// pdfjs-dist's Node build is ESM-only; see payslip-pdf.service.test.ts for why this indirection exists.
const dynamicImport = new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<unknown>;

interface TextItem {
  str?: string;
  transform: number[];
}
interface PdfjsDocument {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: TextItem[] }> }>;
}

async function extractTextItems(pdf: Uint8Array, pageNumber = 1): Promise<TextItem[]> {
  const pdfjs = (await dynamicImport("pdfjs-dist/legacy/build/pdf.mjs")) as {
    getDocument(p: { data: Uint8Array; disableFontFace?: boolean }): { promise: Promise<PdfjsDocument> };
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), disableFontFace: true }).promise;
  const page = await doc.getPage(pageNumber);
  return (await page.getTextContent()).items.filter((item) => (item.str ?? "").trim() !== "");
}

describe("inspectPdfTemplate", () => {
  it("accepts a real PDF and reports its first page size", async () => {
    const info = await inspectPdfTemplate(await makeTemplate());
    assert.equal(info.pageCount, 1);
    assert.equal(info.width, 612);
    assert.equal(info.height, 792);
  });

  it("reports the size of the first page when the PDF has several pages", async () => {
    const info = await inspectPdfTemplate(await makeTemplate([595, 842], 3));
    assert.equal(info.pageCount, 3);
    assert.equal(info.width, 595);
    assert.equal(info.height, 842);
  });

  it("rejects an empty file", async () => {
    await assert.rejects(() => inspectPdfTemplate(new Uint8Array()), InvalidPdfTemplateError);
  });

  it("rejects a file that is not a PDF", async () => {
    await assert.rejects(() => inspectPdfTemplate(Buffer.from("just some text, not a pdf")), /not a PDF/);
  });

  it("rejects a corrupted file that only has a PDF header", async () => {
    await assert.rejects(() => inspectPdfTemplate(Buffer.from("%PDF-1.7\nthis is garbage")), InvalidPdfTemplateError);
  });

  it("rejects a file over 5 MB", async () => {
    const tooBig = new Uint8Array(MAX_PDF_TEMPLATE_BYTES + 1);
    tooBig.set(Buffer.from("%PDF-1.7"));
    await assert.rejects(() => inspectPdfTemplate(tooBig), /5 MB/);
  });
});

describe("applyLetterhead", () => {
  it("keeps the template's page size and puts the content on top of it", async () => {
    const template = await makeTemplate();
    const content = await generatePayslipPdf(payslip(), { letterhead: template });

    const merged = await PDFDocument.load(content);
    assert.equal(merged.getPageCount(), 1);
    assert.deepEqual([merged.getPage(0).getWidth(), merged.getPage(0).getHeight()], LETTER);

    const text = (await extractTextItems(content)).map((item) => item.str).join(" ");
    assert.ok(text.includes("LETTERHEAD-LOGO-1"), "template header is present");
    assert.ok(text.includes("LETTERHEAD-FOOTER"), "template footer is present");
    assert.ok(text.includes("Jane Doe"), "payslip content is present");
    assert.ok(text.includes("Net Salary"), "payslip totals are present");
  });

  it("only uses the first page of a multi-page template", async () => {
    const content = await generatePayslipPdf(payslip(), { letterhead: await makeTemplate(LETTER, 3) });
    const text = (await extractTextItems(content)).map((item) => item.str).join(" ");
    assert.ok(text.includes("LETTERHEAD-LOGO-1"));
    assert.ok(!text.includes("LETTERHEAD-LOGO-2"));
  });

  it("follows a template with a different page size (A4)", async () => {
    const content = await generatePayslipPdf(payslip(), { letterhead: await makeTemplate([595, 842]) });
    const page = (await PDFDocument.load(content)).getPage(0);
    assert.deepEqual([Math.round(page.getWidth()), Math.round(page.getHeight())], [595, 842]);
  });

  it("draws payslip content only inside the safe body area, clear of the header and footer", async () => {
    const content = await generatePayslipPdf(payslip(), { letterhead: await makeTemplate() });
    const items = await extractTextItems(content);
    const payslipItems = items.filter((item) => !(item.str ?? "").startsWith("LETTERHEAD"));
    assert.ok(payslipItems.length > 5);

    const minY = LETTERHEAD_MARGINS.bottom; // pdf y is measured from the bottom
    const maxY = LETTER[1] - LETTERHEAD_MARGINS.top;
    for (const item of payslipItems) {
      const [, , , , x, y] = item.transform;
      assert.ok(y >= minY - 1, `"${item.str}" at y=${y} is below the reserved footer area`);
      assert.ok(y <= maxY, `"${item.str}" at y=${y} is inside the reserved header area`);
      assert.ok(x >= LETTERHEAD_MARGINS.left - 1, `"${item.str}" at x=${x} is left of the margin`);
    }
  });

  it("repeats the letterhead on every page when the content runs onto a second page", async () => {
    const template = await makeTemplate();
    // A long custom-bonus label pushes nothing to page 2 by itself, so build the content directly.
    const { default: PDFKit } = await import("pdfkit");
    const doc = new PDFKit({ size: LETTER, margins: { ...LETTERHEAD_MARGINS } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));
    for (let i = 0; i < 80; i++) doc.text(`Line ${i}`);
    doc.end();
    await done;

    const merged = await applyLetterhead(Buffer.concat(chunks), template);
    const pageCount = (await PDFDocument.load(merged)).getPageCount();
    assert.ok(pageCount >= 2);
    for (let page = 1; page <= pageCount; page++) {
      const text = (await extractTextItems(merged, page)).map((item) => item.str).join(" ");
      assert.ok(text.includes("LETTERHEAD-LOGO-1"), `page ${page} has the letterhead`);
    }
  });
});

describe("payslip line items", () => {
  it("are on separate lines (rows must not print on top of each other)", async () => {
    for (const letterhead of [null, await makeTemplate()]) {
      const items = await extractTextItems(await generatePayslipPdf(payslip(), { letterhead }));
      const labels = ["Base Salary", "Bonuses", "Allowances", "Medical Reimbursement", "Wallet Adjustment", "Loan Deduction"];
      const ys = labels.map((label) => {
        const item = items.find((i) => i.str === label);
        assert.ok(item, `"${label}" is on the page`);
        return item.transform[5];
      });
      for (let i = 1; i < ys.length; i++) {
        assert.ok(ys[i - 1] - ys[i] >= 9, `"${labels[i]}" (y=${ys[i]}) is too close to "${labels[i - 1]}" (y=${ys[i - 1]})`);
      }
    }
  });
});

describe("generatePayslipPdf without a letterhead", () => {
  it("is unchanged: A4 plain design", async () => {
    const page = (await PDFDocument.load(await generatePayslipPdf(payslip()))).getPage(0);
    assert.deepEqual([Math.round(page.getWidth()), Math.round(page.getHeight())], [595, 842]);
  });
});
