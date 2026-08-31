# Phase 18a — Payslip PDF Generation

Scope: build and verify **only** the reusable payslip PDF-rendering layer, as a standalone module. No payroll wiring, no Notification Engine changes, no email/attachment plumbing, no schema changes — all explicitly deferred to later phases pending review of this deliverable.

## PDF Library

**pdfkit** (`^0.20.1`).

Why: pure Node.js, no browser/Chromium dependency, generates a PDF entirely in-process and exposes the result as a `Buffer` (via its `data`/`end` stream events) with no filesystem write required. Actively maintained, MIT-licensed, small dependency footprint (its own transitive dependency is `fontkit`, also pure JS — no native bindings), and well-suited to a short, single-page, form-like document like a payslip. Ruled out Puppeteer/Playwright/a headless-Chromium HTML-to-PDF approach as unnecessary weight for this use case, per the requirement to prefer a simple, reliable library.

## Font Selected and License

pdfkit's built-in standard-14 fonts (Helvetica/Helvetica-Bold) are used for all Latin text, but have **no glyph for `৳`** (U+09F3, the Bengali Taka sign that `formatCurrency()` prepends to every amount) — confirmed via `widthOfString("৳100") === widthOfString("100")`, i.e. the symbol renders with zero width and is effectively invisible.

Rather than alter `formatCurrency()` or substitute an ASCII stand-in, a small subset of **Noto Sans Bengali** is bundled and embedded directly into the generated PDF:

- License: **SIL Open Font License 1.1** (`OFL-1.1`) — free, permits embedding/bundling in a document and commercial use; its only restriction is that the font itself may not be sold standalone under its original name. Full license text + attribution (`Copyright 2025 The Noto Project Authors`) copied verbatim into the repo.
- Files bundled: `NotoSansBengali-Regular.woff` (54 KB) and `NotoSansBengali-Bold.woff` (56 KB) — only the **Bengali-script subset**, extracted from the `@fontsource/noto-sans-bengali` npm distribution rather than pulling in that package's full multi-weight/multi-script bundle (`latin`, `latin-ext`, 9 weights) as a dependency, per the "use the font only where needed" requirement. Confirmed via `fontkit` that this subset genuinely contains a real, non-zero-advance-width glyph for U+09F3 (glyph id 93, advance width 592 units).
- This subset intentionally has **no Latin digit/letter glyphs** — verified with `fontkit.hasGlyphForCodePoint()`. It is used for exactly one character per amount (the `৳` symbol); the grouped digits/comma still render in Helvetica. Total added weight to the repo: ~110 KB across both files.
- pdfkit/`fontkit` natively supports embedding `.woff` files directly (no conversion to `.ttf` needed) — confirmed via `fontkit.create()` parsing the bundled file successfully before wiring it into the renderer.

`formatCurrency()` (`src/lib/currency.ts`) is **unchanged**. The renderer takes its exact output string and splits it — purely for font-switching at render time — into the leading symbol character (drawn in Noto Sans Bengali) and the remaining grouped-digit string (drawn in Helvetica, same baseline, no visible seam), so the rendered payslip shows the identical `৳50,000`-style string the rest of the app already produces.

## PDF Input Data

`PayslipData` mirrors the real fields on `SalaryPayment` (Prisma) exactly — no invented fields:

```ts
interface PayslipData {
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
}
```

The renderer never recalculates anything — it only lays out values it's given, so a generated payslip can never disagree with the stored `SalaryPayment` row it was built from.

## Generated Output

A one-page A4 payslip: company name ("Bit HR", matching the app's existing branding) and "Payslip" subtitle; employee name + email; pay period (month); an **Earnings** section (Base Salary, Bonuses, Allowances, Medical Reimbursement, Wallet Adjustment); a **Deductions** section (Loan Deduction); a divider line; and a bold **Net Salary** line — each amount right-aligned in the app's real currency convention (`৳` + `en-BD` grouped digits).

## Architecture

`generatePayslipPdf(data: PayslipData): Promise<Buffer>` in `src/lib/services/payslip-pdf.service.ts` — the sole export. It:

- Does **not** touch Prisma, SMTP, `NotificationService`, or any other part of the app — confirmed by a dedicated test asserting the module's only export is this one function.
- Does **not** send email, create a `NotificationJob`, call `raiseEvent()`, write to the database, or require a browser.
- Requires no network/database connection — all input is passed in by the caller.

Kept deliberately separate from `payroll.actions.ts` per the requirement to keep this layer independently testable and reusable; wiring it into the actual payroll flow is explicitly Phase 18c's job, not this one's.

## Tests

`src/lib/services/payslip-pdf.service.test.ts` — **16 tests**, all passing (part of a 579-test full-suite run, up from 563 before this phase; no pre-existing test was weakened or removed).

Structural checks operate on the raw buffer (Buffer type, non-empty, `%PDF-` signature, `%%EOF` trailer). Content checks use a genuine, independent PDF text extractor — **`pdfjs-dist`** (Mozilla's own PDF.js, Apache-2.0, **devDependency only**, never shipped to the app) — rather than a naive `buffer.toString().includes(...)` substring search, because pdfkit encodes text into the PDF content stream via per-font encoding schemes (simple WinAnsi byte codes for Helvetica; composite CID codes with a `ToUnicode` CMap for the embedded Bengali font) that a raw string search cannot reliably decode. This choice paid off directly: it caught a real rendering bug (see Limitations/History below) that a naive substring check had been silently missing.

Verified via real extracted text: employee name, pay period month, company name, the actual `৳` Unicode character (not a placeholder), `en-BD`-grouped amounts, every earnings line item, the complete (unclipped) "Deductions" heading plus "Loan Deduction", "Net Salary" plus its amount, and correct zero-value behavior (all earnings/deductions zeroed still produces a valid PDF with every heading present and `0` rendered, not blank/dropped).

### A bug the real-parser tests caught

An earlier iteration of the renderer left pdfkit's internal `doc.x` cursor at the far-right margin after each right-aligned amount line (from the amount's explicit-`x` `.text()` call). The next unpositioned `.text("Deductions")` call inherited that leftover position, leaving only a sliver of width before the page's right margin — pdfkit wrapped the word there, rendering `"Deductio"` with the `"ns"` silently lost. This was invisible to a naive substring check (which never looks for a *complete* word, only a *contained* one — `"Deductio"` still contains `"Deducti"`, `"Deductio"`, etc.) but was caught immediately once real extracted text was compared against the expected complete string. Fixed with a one-line reset (`doc.x = doc.page.margins.left`) after each amount line; a dedicated regression test now guards this specific failure mode.

## Limitations / Known Follow-ups (not fixed now — out of Phase 18a's scope)

- **Font loading path**: the renderer resolves the bundled font files via `path.join(process.cwd(), "src/lib/services/assets/fonts/...")`, which is correct for `pnpm test`, `next dev`, and a normal `next start` from the project root. Next.js's standalone Docker build (`output: standalone`, per this project's deployment) only copies file-traced assets into `.next/standalone` and runs with that as `cwd` — this path resolution has **not** been verified against that specific deployment shape, since the module isn't wired into any real request path yet. This needs to be checked (likely via `outputFileTracingIncludes` in `next.config`, or embedding the font as a bundled buffer/base64 constant) as part of whichever phase actually calls this renderer from a Server Action.
- Single-page layout only — no pagination logic if a future payslip design grows beyond one page's content.
- No PDF/A or print-quality color profile handling — a plain, readable single-color-space document.

## Verification Results

- `pnpm tsc --noEmit` — zero errors, whole project.
- `pnpm eslint` — zero warnings/errors, whole project.
- `pnpm run test` — **579/579 passing** (16 new, 563 pre-existing unmodified and still green).
- `pnpm run build` — run by the user (not this agent, per standing instruction) after this phase's changes: **build succeeded** ("Compiled successfully"), same 5 pre-existing cosmetic Edge Runtime warnings as before (`crypto.ts`, `container.ts`, `delivery-manager.ts`, `notification.service.ts`, `production-worker.ts` — all pre-existing, none related to this phase's files).
- Real-PDF manual verification: generated an actual payslip PDF (7,491 bytes) and independently parsed it with `pdfjs-dist`; confirmed employee name, month, company name, the real `৳` glyph, correctly grouped amounts, and the complete (unclipped) Earnings/Deductions/Net Salary content all extract correctly.

## Files

**Created**: `src/lib/services/payslip-pdf.service.ts`, `src/lib/services/payslip-pdf.service.test.ts`, `src/lib/services/assets/fonts/NotoSansBengali-Regular.woff`, `src/lib/services/assets/fonts/NotoSansBengali-Bold.woff`, `src/lib/services/assets/fonts/NotoSansBengali-LICENSE.txt`, this report.

**Modified**: `package.json` (added `pdfkit` dependency, `@types/pdfkit`/`pdfjs-dist` devDependencies, registered the new test file), `pnpm-lock.yaml`, `tsconfig.test.json` (registered the new source/test file pair).

**Not touched**: `prisma/schema.prisma`, any migration, `payroll.actions.ts`, `NotificationService`, `NotificationJob`, `JobDispatcher`, `SmtpDeliveryProvider`, any loan-notification code, any UI page/component.

## Database

**None.** No migration created or applied.

## Next Recommended Phase

Pending your review of this deliverable — Phase 18b (extend the frozen `RenderedNotificationContent` interface additively, wire `JobDispatcher`/`SmtpDeliveryProvider` to forward an attachment) and Phase 18c (wire `processPayroll()` to actually call this renderer and raise a `PAYROLL_PROCESSED` event with a `documentId`), per the plan laid out in the earlier read-only audit — not started.
