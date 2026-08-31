import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as PayslipPdfModule from "./payslip-pdf.service";
import { generatePayslipPdf } from "./payslip-pdf.service";
import type { PayslipData } from "./payslip-pdf.service";

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

interface PdfjsTextItem {
  str?: string;
}
interface PdfjsTextContent {
  items: PdfjsTextItem[];
}
interface PdfjsPage {
  getTextContent(): Promise<PdfjsTextContent>;
}
interface PdfjsDocument {
  getPage(pageNumber: number): Promise<PdfjsPage>;
}
interface PdfjsLoadingTask {
  promise: Promise<PdfjsDocument>;
}
interface PdfjsModule {
  getDocument(params: { data: Uint8Array; disableFontFace?: boolean }): PdfjsLoadingTask;
}

/**
 * pdfkit encodes text into PDF content streams via per-font encoding
 * (simple WinAnsi byte codes for the standard Helvetica font, composite
 * CID codes + a ToUnicode CMap for the embedded Noto Sans Bengali font) —
 * a naive `buffer.toString().includes(...)` check is not reliable for
 * either. This uses the real, independent pdf.js parser (already a
 * devDependency for this reason) to genuinely decode the rendered text,
 * the same way any conformant PDF viewer would.
 *
 * `pdfjs-dist`'s legacy Node build is ESM-only (`.mjs`, no CJS entry point
 * in this major version). This test suite compiles to CommonJS
 * (tsconfig.test.json), and TypeScript downlevels a literal `import()`
 * under `module: "commonjs"` into a `require()` call, which cannot load an
 * ESM module (`ERR_REQUIRE_ESM`). Routing the call through `new
 * Function(...)` hides it from TypeScript's downlevel transform so the
 * emitted JS keeps a real dynamic `import()`, which Node's CJS loader can
 * use to load ESM directly.
 */
const dynamicImport = new Function("specifier", "return import(specifier);") as (
  specifier: string
) => Promise<unknown>;

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = (await dynamicImport("pdfjs-dist/legacy/build/pdf.mjs")) as PdfjsModule;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), disableFontFace: true }).promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  return textContent.items.map((item) => item.str ?? "").join(" ");
}

describe("generatePayslipPdf — Phase 18a", () => {
  it("succeeds and resolves to a Buffer", async () => {
    const result = await generatePayslipPdf(payslip());
    assert.equal(Buffer.isBuffer(result), true);
  });

  it("returns a non-empty buffer", async () => {
    const result = await generatePayslipPdf(payslip());
    assert.ok(result.length > 0);
  });

  it("has a valid PDF file signature", async () => {
    const result = await generatePayslipPdf(payslip());
    assert.equal(result.subarray(0, 5).toString("latin1"), "%PDF-");
  });

  it("ends with the standard PDF end-of-file marker", async () => {
    const result = await generatePayslipPdf(payslip());
    const tail = result.subarray(-16).toString("latin1");
    assert.ok(tail.includes("%%EOF"));
  });

  it("is a structurally valid PDF that pdf.js can parse and render one page from", async () => {
    const result = await generatePayslipPdf(payslip());
    const text = await extractPdfText(result);
    assert.ok(text.length > 0);
  });

  it("embeds the employee name as genuinely extractable text", async () => {
    const result = await generatePayslipPdf(payslip({ employeeName: "Zephyrine Okonkwo-Whitfield" }));
    const text = await extractPdfText(result);
    assert.ok(text.includes("Zephyrine Okonkwo-Whitfield"));
  });

  it("embeds the pay period month/year", async () => {
    const result = await generatePayslipPdf(payslip({ month: "2026-11" }));
    const text = await extractPdfText(result);
    assert.ok(text.includes("2026-11"));
  });

  it("embeds the company name", async () => {
    const result = await generatePayslipPdf(payslip());
    const text = await extractPdfText(result);
    assert.ok(text.includes("Bit HR"));
  });

  it("renders the actual '৳' currency symbol as real Unicode text (bundled Noto Sans Bengali glyph, not Helvetica's zero-width fallback)", async () => {
    const result = await generatePayslipPdf(payslip());
    const text = await extractPdfText(result);
    assert.ok(text.includes("৳"));
  });

  it("formats amounts with en-BD digit grouping, matching the app's formatCurrency() convention", async () => {
    const result = await generatePayslipPdf(payslip({ netAmount: 123456, baseSalary: 987654 }));
    const text = await extractPdfText(result);
    assert.ok(text.includes("123,456"));
    assert.ok(text.includes("987,654"));
  });

  it("includes every earnings line item, complete and unclipped", async () => {
    const result = await generatePayslipPdf(payslip());
    const text = await extractPdfText(result);
    assert.ok(text.includes("Earnings"));
    assert.ok(text.includes("Base Salary"));
    assert.ok(text.includes("Bonuses"));
    assert.ok(text.includes("Allowances"));
    assert.ok(text.includes("Medical Reimbursement"));
    assert.ok(text.includes("Wallet Adjustment"));
  });

  it("includes the Deductions heading complete and unclipped (regression check for the doc.x cursor-leak fix)", async () => {
    const result = await generatePayslipPdf(payslip());
    const text = await extractPdfText(result);
    assert.ok(text.includes("Deductions"));
    assert.ok(!text.includes("Deductio "));
    assert.ok(text.includes("Loan Deduction"));
  });

  it("includes the Net Salary heading and the correctly formatted net amount", async () => {
    const result = await generatePayslipPdf(payslip({ netAmount: 55500 }));
    const text = await extractPdfText(result);
    assert.ok(text.includes("Net Salary"));
    assert.ok(text.includes("55,500"));
  });

  it("handles zero bonuses/allowances/deductions: still valid, still contains every heading, and renders '0' for each zeroed line", async () => {
    const result = await generatePayslipPdf(
      payslip({
        totalBonuses: 0,
        totalAllowances: 0,
        medicalReimbursement: 0,
        loanDeduction: 0,
        walletAdjustment: 0,
        netAmount: 50000,
      })
    );
    assert.equal(Buffer.isBuffer(result), true);
    assert.ok(result.length > 0);

    const text = await extractPdfText(result);
    assert.ok(text.includes("Earnings"));
    assert.ok(text.includes("Deductions"));
    assert.ok(text.includes("Net Salary"));
    assert.ok(text.includes("50,000"));
    // Every zeroed line renders a real "0" amount, not a blank/dropped value.
    assert.ok(/৳\s*0(?!,)/.test(text));
  });

  it("omits the email line when employeeEmail is not provided, without throwing", async () => {
    const result = await generatePayslipPdf(payslip({ employeeEmail: undefined }));
    assert.equal(Buffer.isBuffer(result), true);
    assert.ok(result.length > 0);
  });

  it("exposes only the renderer function — no Prisma/database/email surface on this module", () => {
    assert.equal(typeof PayslipPdfModule.generatePayslipPdf, "function");
    assert.deepEqual(Object.keys(PayslipPdfModule), ["generatePayslipPdf"]);
  });
});
