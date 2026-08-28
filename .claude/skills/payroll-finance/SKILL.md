---
name: payroll-finance
description: Explains bit2.0's money-related domain logic — monthly payroll processing, loan/EMI waterfall math, wallet ledger, medical claims, and overtime payout — the most calculation-heavy and easiest-to-silently-break part of the codebase. Use before changing anything in src/actions/payroll.actions.ts, loan.service.ts, wallet, medical, or overtime payout logic.
---

# bit2.0 — Payroll & Finance Domain

This is the highest-stakes part of the codebase — bugs here mean real employees get paid
wrong amounts. Every change should be checked against the "immutability" and "ledger over
cache" rules below.

## Monthly payroll processing (the central transaction)

`processPayroll(payrollMonth, selectedBonuses, emiDisabledUsers)` in
[src/actions/payroll.actions.ts:328](src/actions/payroll.actions.ts#L328) is the single
entry point that finalizes a month. It:

1. **Immutability check**: refuses to run if a `SalaryPayment` already exists for that
   `payrollMonth` (`"YYYY-MM"` string) — payroll for a given month can only be processed
   once. If you need a "re-run" feature, it must delete/reverse the prior `SalaryPayment`
   and all its side effects explicitly, not just call `processPayroll` again.
2. Wraps everything in a single `prisma.$transaction` — all-or-nothing per payroll run. Any
   new side effect added inside this function must go through the same `tx` client, not
   the top-level `prisma`.
3. Per employee: computes `netPay` from `getPayrollAggregation()` (base salary + selected
   bonuses + allowances + medical reimbursement − loan deduction), **adds back the current
   `walletBalance`** (positive or negative) into the final net pay, then **zeroes the wallet
   and writes an offsetting `WalletTransaction` (`type: ADJUSTMENT`)** — the wallet is a
   running "pending settlement" balance that gets swept into salary every month, not a
   persistent account.
4. If a user's EMI is in `emiDisabledUsers` for this run, their deduction is skipped *and*
   the skipped EMI amount is folded into `carryForward` on `EmiState`, redistributed across
   the loan's remaining months — it does not just vanish or reduce the payout.
5. All currently `APPROVED` `MedicalClaim`s for the employee are bulk-flipped to `PAID` —
   this is the only place claims transition out of `APPROVED`, so don't add a second path
   that marks claims `PAID` outside a payroll run.
6. Applied bonuses are written to `AuditLog` as a text trail (reusing the loan `AuditLog`
   model for a non-loan event) — keep using this model for payroll-adjacent audit entries
   rather than inventing a parallel log table.

`SalaryPayment` rows are the permanent historical record — always treat them as
append-only; a correction is a new adjustment, not an edit of a past `SalaryPayment` row.

## Loan / EMI math

[src/lib/services/loan.service.ts](src/lib/services/loan.service.ts) is the authoritative
EMI engine — reuse it rather than recalculating EMI inline elsewhere.

- **`calculateEMI(remainingPrincipal, remainingMonths)`**: `round(principal / months)`,
  except the last month, where EMI = full remaining principal (avoids a leftover rounding
  remainder on the final payment). `remainingMonths <= 0` → `0`.
- **`processLoanPayment(loanId, amount, type)`** applies a payment via a strict **waterfall**,
  in a `$transaction`, always in this order — preserve this order in any related change:
  1. Deduct from `EmiState.carryForward` first.
  2. Then deduct from `EmiState.currentEmi`.
  3. Any remainder reduces `Loan.remainingPrincipal` directly (an overpayment).
- `checkLoanEligibility` and `refreshEmiState` (recompute EMI after principal/month changes)
  round out the service — call these instead of writing ad hoc eligibility or recalculation
  logic in an action.
- Loans have a **dual approval track**: manager pre-verification
  (`MANAGER_VERIFIED`/`MANAGER_REJECTED`) then admin approval — don't assume `PENDING →
  APPROVED` is the only path; see `[[auth-roles-permissions]]` for who can act at each step.

## Wallet ledger vs. wallet requests — two different models

- `WalletTransaction`: append-only ledger of every credit/debit (`TransactionType`:
  `SALARY_CREDIT | WITHDRAWAL | REIMBURSEMENT | ADJUSTMENT | LOAN_DEDUCTION |
  YEARLY_OT_UT_ADJUSTMENT`). `User.walletBalance` is a **denormalized running total** of
  this ledger — if you ever need to reconcile or debug a wrong balance, sum the ledger, don't
  trust the cached field, and any manual balance fix must also insert a corresponding
  `WalletTransaction` row so the two stay consistent.
- `WalletRequest`: a separate employee-initiated ask (e.g. an advance/withdrawal) with its
  own `PENDING/APPROVED/REJECTED` status — approving one should create the matching
  `WalletTransaction`, it doesn't happen automatically.

## Medical claims

`MedicalEntitlement` (per user/year `totalLimit`/`remainingBalance`) gates `MedicalClaim`
creation — check remaining balance before allowing a new claim, and decrement it on
approval, not on submission. Claims move `PENDING → APPROVED → PAID` (the last transition
only happens inside `processPayroll`, see above) or `PENDING → REJECTED`.
`SystemSettings.medicalClaimLimit` is a separate **global** default limit (distinct from the
per-user/year `MedicalEntitlement.totalLimit`), used when provisioning new entitlements.

## Overtime payout

`OvertimePayout` is a **yearly** settlement (`@@unique([userId, year])`), separate from the
day-to-day `overtimeUndertime` tracked per `DailyTimeRecord`. It aggregates a full year's
required/actual time into `totalOvertimeMinutes` and a `calculatedAmount`, then tracks
`isPaid`/`paidAt`/`paidBy` once settled — don't confuse this with the daily
`OvertimeRequest` approval workflow (`[[attendance-automation]]`), which governs whether a
specific day's extra hours count as overtime at all before they ever reach this yearly
aggregate.

## General rules for this domain

- Prefer extending `getPayrollAggregation()` for anything that needs a "what would this
  employee be paid" preview, so the preview and the actual `processPayroll` run never drift
  apart.
- Every money-moving action should be reversible via an explicit compensating write (new
  ledger row, new `AuditLog` entry) — never mutate a balance in place without leaving a
  trail, since payroll disputes need to be traceable after the fact.
