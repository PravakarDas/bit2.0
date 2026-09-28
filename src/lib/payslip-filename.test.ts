import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getMonthName,
  sanitizeForDriveName,
  generatePayrollMonthFolderName,
  resolveBranchFolderName,
  generatePayslipFilename,
} from "./payslip-filename";

describe("getMonthName", () => {
  it("maps 1-12 to the exact full month name (folder naming must read exactly 'February', not '02' or 'Feb')", () => {
    assert.equal(getMonthName(1), "January");
    assert.equal(getMonthName(2), "February");
    assert.equal(getMonthName(12), "December");
  });

  it("throws on an out-of-range or non-integer month number rather than producing a wrong folder name", () => {
    assert.throws(() => getMonthName(0));
    assert.throws(() => getMonthName(13));
    assert.throws(() => getMonthName(2.5));
  });
});

describe("sanitizeForDriveName — employee name sanitization", () => {
  it("replaces a single space between names with a single underscore (matches the required example format)", () => {
    assert.equal(sanitizeForDriveName("Abdul Kader"), "Abdul_Kader");
  });

  it("strips characters Drive/filesystems reject: / \\ : * ? \" < > |", () => {
    assert.equal(sanitizeForDriveName('A/B\\C:D*E?F"G<H>I|J'), "A_B_C_D_E_F_G_H_I_J");
  });

  it("never produces a path separator in the output, even from adjacent slashes", () => {
    const result = sanitizeForDriveName("../../etc/passwd");
    assert.equal(result.includes("/"), false);
    assert.equal(result.includes("\\"), false);
  });

  it("collapses repeated whitespace/underscores into one underscore", () => {
    assert.equal(sanitizeForDriveName("Md    Abdul   Kader"), "Md_Abdul_Kader");
  });

  it("trims leading/trailing whitespace and underscores", () => {
    assert.equal(sanitizeForDriveName("  Kader  "), "Kader");
  });

  it("strips control characters", () => {
    assert.equal(sanitizeForDriveName("Kader\x00\x1F"), "Kader");
  });

  it("is deterministic — the same input always produces the same output", () => {
    const name = "Md. Abdul-Kader (Sales)";
    assert.equal(sanitizeForDriveName(name), sanitizeForDriveName(name));
  });

  it("falls back to a non-empty placeholder when sanitization would otherwise produce an empty string", () => {
    assert.equal(sanitizeForDriveName("***"), "unnamed");
    assert.equal(sanitizeForDriveName(""), "unnamed");
  });
});

describe("generatePayrollMonthFolderName", () => {
  it("produces '{Month} {Year}' exactly", () => {
    assert.equal(generatePayrollMonthFolderName(2026, 2), "February 2026");
  });
});

describe("resolveBranchFolderName", () => {
  it("returns 'Unassigned' for null (no branch assigned)", () => {
    assert.equal(resolveBranchFolderName(null), "Unassigned");
  });

  it("returns 'Unassigned' for undefined", () => {
    assert.equal(resolveBranchFolderName(undefined), "Unassigned");
  });

  it("returns 'Unassigned' for a blank/whitespace-only branch name", () => {
    assert.equal(resolveBranchFolderName("   "), "Unassigned");
  });

  it("sanitizes and returns a real branch name unchanged when it's already filename-safe", () => {
    assert.equal(resolveBranchFolderName("Dhaka Main"), "Dhaka_Main");
  });
});

describe("generatePayslipFilename — deterministic filename generation", () => {
  it("produces the exact documented format for the documented example", () => {
    const filename = generatePayslipFilename({
      employeeName: "Abdul Kader",
      year: 2026,
      monthNumber: 2,
    });
    assert.equal(filename, "Abdul_Kader_February_2026.pdf");
  });

  it("is deterministic — the same employee/month payroll always produces the same filename", () => {
    const input = { employeeName: "Rahim Uddin", year: 2026, monthNumber: 8 };
    assert.equal(generatePayslipFilename(input), generatePayslipFilename(input));
  });

  it("sanitizes special characters in the employee name so the filename stays valid", () => {
    const filename = generatePayslipFilename({
      employeeName: 'Md. "Rana"/Khan',
      year: 2026,
      monthNumber: 3,
    });
    assert.equal(filename.includes("/"), false);
    assert.equal(filename.includes('"'), false);
    assert.equal(filename, "Md._Rana_Khan_March_2026.pdf");
  });

  it("never contains the employee's system id", () => {
    const filename = generatePayslipFilename({ employeeName: "Pravakar Das Demo", year: 2026, monthNumber: 8 });
    assert.equal(filename, "Pravakar_Das_Demo_August_2026.pdf");
    assert.ok(!filename.includes("cmtd"));
  });

  it("always ends in .pdf", () => {
    const filename = generatePayslipFilename({ employeeName: "Name", year: 2026, monthNumber: 1 });
    assert.match(filename, /\.pdf$/);
  });
});
