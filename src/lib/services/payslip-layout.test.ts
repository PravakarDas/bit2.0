import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generatePayslipPdf } from "./payslip-pdf.service";
import type { PayslipData } from "./payslip-pdf.service";
import { formatEmployeeCode } from "../employee-code";

function payslip(overrides: Partial<PayslipData> = {}): PayslipData {
  return {
    employeeName: "Sarah Khan",
    employeeEmail: "sarah.khan@example.com",
    employeeId: "BTCD1042",
    month: "2026-05",
    baseSalary: 100000,
    totalBonuses: 12000,
    totalAllowances: 3000,
    medicalReimbursement: 1500,
    loanDeduction: 10000,
    walletAdjustment: -500,
    netAmount: 106000,
    customBonus: 2000,
    customBonusNote: "Eid gift",
    bonusLines: [{ label: "Performance Bonus", amount: 10000 }],
    loanLines: [{ label: "EMI - Loan #abc123 (balance Tk 50,000)", amount: 10000 }],
    walletTransactions: [
      { date: "2026-05-04T05:00:00.000Z", description: "Absent without leave penalty for 2026-05-04", amount: -800 },
      { date: "2026-05-09T05:00:00.000Z", description: "Approved Request: Office supplies (Ref: a1b2c3)", amount: 300 },
    ],
    ...overrides,
  };
}

// pdfjs-dist's Node build is ESM-only; see payslip-pdf.service.test.ts for why this indirection exists.
const dynamicImport = new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<unknown>;

/** Text of every page, in order. */
async function extractPages(pdf: Uint8Array): Promise<string[]> {
  const pdfjs = (await dynamicImport("pdfjs-dist/legacy/build/pdf.mjs")) as {
    getDocument(p: { data: Uint8Array; disableFontFace?: boolean }): {
      promise: Promise<{
        numPages: number;
        getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str?: string }[] }> }>;
      }>;
    };
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), disableFontFace: true }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map((item) => item.str ?? "").join(" "));
  }
  return pages;
}

describe("formatEmployeeCode", () => {
  it("prefixes the attendance id with BTCD", () => {
    assert.equal(formatEmployeeCode("1042"), "BTCD1042");
    assert.equal(formatEmployeeCode(" 7 "), "BTCD7");
  });

  it("has no code when the employee has no attendance id", () => {
    assert.equal(formatEmployeeCode(null), null);
    assert.equal(formatEmployeeCode(undefined), null);
    assert.equal(formatEmployeeCode("   "), null);
  });
});

describe("payslip layout", () => {
  it("prints name, employee id and email in the header block, before the earnings", async () => {
    const [page1] = await extractPages(await generatePayslipPdf(payslip()));
    assert.ok(page1.includes("Sarah Khan"));
    assert.ok(page1.includes("BTCD1042"));
    assert.ok(page1.includes("sarah.khan@example.com"));
    assert.ok(page1.indexOf("BTCD1042") < page1.indexOf("Earnings"));
  });

  it("prints N/A when the employee has no id", async () => {
    const [page1] = await extractPages(await generatePayslipPdf(payslip({ employeeId: null })));
    assert.ok(page1.includes("N/A"));
  });

  it("itemises bonuses (types and custom) and loan deductions as separate line items", async () => {
    const [page1] = await extractPages(await generatePayslipPdf(payslip()));
    for (const text of ["Bonuses", "Performance Bonus", "Eid gift", "Loan Deduction", "EMI - Loan #abc123", "Net Salary", "Wallet Adjustment"]) {
      assert.ok(page1.includes(text), `page 1 has "${text}"`);
    }
  });

  it("itemises each allowance under the Allowances total", async () => {
    const [page1] = await extractPages(
      await generatePayslipPdf(
        payslip({
          totalAllowances: 8000,
          allowanceLines: [
            { label: "Transport Allowance", amount: 5000 },
            { label: "Internet Allowance", amount: 3000 },
          ],
          netAmount: 111000,
        })
      )
    );
    assert.ok(/Allowances\s+৳\s*8,000/.test(page1), "total shown");
    assert.ok(/Transport Allowance\s+৳\s*5,000/.test(page1), "first allowance itemised");
    assert.ok(/Internet Allowance\s+৳\s*3,000/.test(page1), "second allowance itemised");
    assert.ok(page1.indexOf("Allowances") < page1.indexOf("Transport Allowance"));
    assert.ok(page1.indexOf("Internet Allowance") < page1.indexOf("Medical Reimbursement"), "listed under Allowances, before Medical");
  });

  it("still shows just the Allowances total when there is no breakdown (older payslips)", async () => {
    const [page1] = await extractPages(await generatePayslipPdf(payslip({ totalAllowances: 3000, allowanceLines: undefined })));
    assert.ok(/Allowances\s+৳\s*3,000/.test(page1));
  });

  it("shows a negative wallet adjustment and a loan deduction with a minus sign", async () => {
    const [page1] = await extractPages(await generatePayslipPdf(payslip()));
    assert.ok(/-\s*৳\s*500/.test(page1), "wallet deduction is signed");
    assert.ok(/-\s*৳\s*10,000/.test(page1), "loan deduction is signed");
  });

  it("mentions 0 for lines with no value", async () => {
    const [page1] = await extractPages(
      await generatePayslipPdf(
        payslip({ totalBonuses: 0, customBonus: 0, bonusLines: [], loanDeduction: 0, loanLines: [], walletAdjustment: 0, netAmount: 104500 })
      )
    );
    assert.ok(/Bonuses\s+৳\s*0(?!,)/.test(page1), "bonuses shows 0");
    assert.ok(/Wallet Adjustment\s+৳\s*0(?!,)/.test(page1), "wallet shows 0");
    assert.ok(/Loan Deduction\s+৳\s*0(?!,)/.test(page1), "loan shows 0");
  });
});

describe("wallet page", () => {
  it("follows the payslip and lists only the supplied entries, with dates", async () => {
    const pages = await extractPages(await generatePayslipPdf(payslip()));
    assert.equal(pages.length, 2);
    assert.ok(pages[1].includes("Wallet Transactions"));
    assert.ok(pages[1].includes("Absent without leave penalty for 2026-05-04"));
    assert.ok(pages[1].includes("Approved Request: Office supplies"));
    assert.ok(pages[1].includes("2026-05-04"));
    assert.ok(pages[1].includes("Total (Wallet Adjustment)"));
  });

  it("is not added when no wallet data is supplied (older payslips)", async () => {
    const pages = await extractPages(await generatePayslipPdf(payslip({ walletTransactions: undefined })));
    assert.equal(pages.length, 1);
    assert.ok(!pages[0].includes("Wallet Transactions"));
  });

  it("says so when the wallet had no activity", async () => {
    const pages = await extractPages(await generatePayslipPdf(payslip({ walletTransactions: [], walletAdjustment: 0 })));
    assert.equal(pages.length, 2);
    assert.ok(pages[1].includes("No wallet transactions in this period."));
  });

  it("adds a reconciling row when the entries do not add up to the wallet adjustment", async () => {
    // entries sum to -500 (= -800 + 300) and the adjustment is -500: no extra row.
    const balanced = await extractPages(await generatePayslipPdf(payslip()));
    assert.ok(!balanced[1].includes("Other adjustments"));

    const unbalanced = await extractPages(await generatePayslipPdf(payslip({ walletAdjustment: -1200 })));
    assert.ok(unbalanced[1].includes("Other adjustments (not itemised)"));
  });

  it("never prints characters Helvetica cannot draw (Bengali text, the taka sign)", async () => {
    const pages = await extractPages(
      await generatePayslipPdf(payslip({ walletTransactions: [{ date: "2026-05-04", description: "বেতন ৳500 adjustment", amount: 500 }] }))
    );
    assert.ok(pages[1].includes("Tk 500 adjustment"));
    assert.ok(!pages[1].includes("বেতন"));
  });
});

describe("page numbers", () => {
  it("number the payslip and the wallet section separately, each starting at 1", async () => {
    const pages = await extractPages(await generatePayslipPdf(payslip()));
    assert.equal(pages.length, 2);
    assert.ok(pages[0].includes("1 of 1"), "payslip is 1 of 1");
    assert.ok(pages[1].includes("1 of 1"), "wallet page restarts at 1 of 1");
    assert.ok(!pages[0].includes("of 2") && !pages[1].includes("of 2"), "not one continuous numbering");
  });

  it("read '1 of 1' on a single page payslip", async () => {
    const [page1] = await extractPages(await generatePayslipPdf(payslip({ walletTransactions: undefined })));
    assert.ok(page1.includes("1 of 1"));
  });

  it("run onto extra pages when there are many wallet entries, repeating the table header", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      date: `2026-05-${String((i % 28) + 1).padStart(2, "0")}T05:00:00.000Z`,
      description: `Entry number ${i + 1}`,
      amount: i % 2 === 0 ? 100 : -100,
    }));
    const pages = await extractPages(await generatePayslipPdf(payslip({ walletTransactions: many, walletAdjustment: 0 })));
    assert.ok(pages.length >= 3);
    // the payslip is one page; the wallet section has its own numbering: 1 of M ... M of M
    const walletPages = pages.slice(1);
    assert.ok(pages[0].includes("1 of 1"));
    walletPages.forEach((text, i) => assert.ok(text.includes(`${i + 1} of ${walletPages.length}`), `wallet page ${i + 1} is numbered`));
    assert.ok(pages[pages.length - 1].includes("Total (Wallet Adjustment)"));
    for (const later of walletPages.slice(1)) assert.ok(later.includes("Description"), "table header repeats");
    // every entry appears exactly once across the pages
    const all = pages.join(" ");
    for (let i = 1; i <= 60; i++) assert.equal(all.split(`Entry number ${i} `).length - 1 + (all.endsWith(`Entry number ${i}`) ? 1 : 0) >= 1, true);
  });

  it("also work on a letterhead (numbered inside the content area)", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const template = await PDFDocument.create();
    template.addPage([612, 792]);
    const pages = await extractPages(await generatePayslipPdf(payslip(), { letterhead: await template.save() }));
    assert.equal(pages.length, 2);
    assert.ok(pages[0].includes("1 of 1"));
    assert.ok(pages[1].includes("1 of 1"));
  });

  it("number a payslip that itself runs onto a second page separately from the wallet section", async () => {
    const manyBonuses = Array.from({ length: 45 }, (_, i) => ({ label: `Bonus type ${i + 1}`, amount: 100 }));
    const pages = await extractPages(await generatePayslipPdf(payslip({ bonusLines: manyBonuses, totalBonuses: 4500 })));
    assert.equal(pages.length, 3); // 2 payslip pages + 1 wallet page
    assert.ok(pages[0].includes("1 of 2"));
    assert.ok(pages[1].includes("2 of 2"));
    assert.ok(pages[2].includes("1 of 1"));
    assert.ok(pages[2].includes("Wallet Transactions"));
  });
});
