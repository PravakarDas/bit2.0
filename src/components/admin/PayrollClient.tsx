"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    saveDraftPayroll,
    finalizeAndSendPayslips,
    resendPayslips,
    type getPayrollAggregation,
    type getFinalizedPayrollForMonth,
    type PayslipSendResult,
} from "@/actions/payroll.actions";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, FileDown, Gift, Pencil, Send, RefreshCw } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTime12 } from "@/lib/utils";

type PayrollRow = Awaited<ReturnType<typeof getPayrollAggregation>>[number];
type FinalizedRow = Awaited<ReturnType<typeof getFinalizedPayrollForMonth>>[number];

/** Form state per employee (amounts are kept as text while typing). */
interface EmployeeForm {
    bonusIds: string[];
    customBonus: string;
    customBonusNote: string;
    /** "" = pay the approved claims total. */
    medical: string;
    /** loanId -> typed amount. "" = scheduled EMI for old EMI loans, 0 for manual loans. */
    loanDeductions: Record<string, string>;
}

interface PayrollCsvRow {
    userId: string;
    employeeName: string;
    accountNumber: string;
    netPayAmount: string;
}

const money = (n: number) => n.toLocaleString("en-BD");
const num = (text: string | undefined) => {
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? n : 0;
};

function formFromRow(emp: PayrollRow): EmployeeForm {
    const draft = emp.draft?.inputs;
    return {
        bonusIds: draft?.bonusIds ?? [],
        customBonus: draft && draft.customBonus > 0 ? String(draft.customBonus) : "",
        customBonusNote: draft?.customBonusNote ?? "",
        medical: draft && draft.medicalAmount !== null && draft.medicalAmount !== undefined ? String(draft.medicalAmount) : "",
        loanDeductions: Object.fromEntries(
            Object.entries(draft?.loanDeductions ?? {}).map(([id, amount]) => [id, String(amount)])
        ),
    };
}

export function PayrollClient({
    initialData,
    finalized,
    month,
    year
}: {
    initialData: PayrollRow[],
    finalized: FinalizedRow[],
    month: number,
    year: number
}) {
    const router = useRouter();
    const data = initialData;
    const payrollMonth = `${year}-${month.toString().padStart(2, '0')}`;

    const [forms, setForms] = useState<Record<string, EmployeeForm>>(() =>
        Object.fromEntries(data.map((emp) => [emp.userId, formFromRow(emp)]))
    );
    // "edit": admin is entering figures. "generated": CSV generated, figures locked until Edit is pressed.
    const [mode, setMode] = useState<"edit" | "generated">(
        data.length > 0 && data.every((emp) => emp.draft) ? "generated" : "edit"
    );
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [selectedResend, setSelectedResend] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState<null | "generate" | "send" | "resend">(null);
    const [confirmSend, setConfirmSend] = useState<string[] | null>(null);

    const locked = mode === "generated";
    const formOf = (emp: PayrollRow): EmployeeForm =>
        forms[emp.userId] ?? { bonusIds: [], customBonus: "", customBonusNote: "", medical: "", loanDeductions: {} };

    const updateForm = (userId: string, patch: Partial<EmployeeForm>) =>
        setForms((prev) => ({ ...prev, [userId]: { ...prev[userId], ...patch } }));

    const toggleBonus = (emp: PayrollRow, bonusId: string) => {
        const form = formOf(emp);
        updateForm(emp.userId, {
            bonusIds: form.bonusIds.includes(bonusId) ? form.bonusIds.filter((id) => id !== bonusId) : [...form.bonusIds, bonusId],
        });
    };

    const medicalAmount = (emp: PayrollRow) => {
        const text = formOf(emp).medical.trim();
        return text === "" ? emp.totalMedical : Math.max(0, Number(text) || 0);
    };

    const scheduledEmi = (loan: PayrollRow["activeLoans"][number]) => loan.currentEmi + loan.carryForward;

    const autoLoanAmount = (emp: PayrollRow, loan: PayrollRow["activeLoans"][number]) => {
        const text = formOf(emp).loanDeductions[loan.id];
        return text === undefined || text.trim() === "" ? scheduledEmi(loan) : Number(text) || 0;
    };

    const loanDeductionTotal = (emp: PayrollRow) =>
        emp.activeLoans.reduce((sum, l) => sum + autoLoanAmount(emp, l), 0) +
        emp.manualLoans.reduce((sum, l) => sum + num(formOf(emp).loanDeductions[l.id]), 0);

    const bonusTotal = (emp: PayrollRow) => {
        const form = formOf(emp);
        const types = emp.eligibleBonuses.filter((b) => form.bonusIds.includes(b.id)).reduce((sum, b) => sum + b.amount, 0);
        return types + num(form.customBonus);
    };

    const netPay = (emp: PayrollRow) =>
        emp.baseSalary + emp.totalAllowances + medicalAmount(emp) + bonusTotal(emp) + emp.walletBalance - loanDeductionTotal(emp);

    // Returns a message when this employee's figures can't be saved.
    const validationError = (emp: PayrollRow): string | null => {
        const form = formOf(emp);
        if (num(form.customBonus) > 0 && !form.customBonusNote.trim()) return "Custom bonus needs a label";
        if (form.medical.trim() !== "" && Number(form.medical) < 0) return "Medical can't be negative";
        for (const loan of [...emp.activeLoans, ...emp.manualLoans]) {
            const text = form.loanDeductions[loan.id];
            if (text && Number(text) < 0) return "Loan deduction can't be negative";
            const amount = "currentEmi" in loan ? autoLoanAmount(emp, loan) : num(text);
            if (amount > loan.remainingPrincipal) return "Loan deduction exceeds remaining balance";
        }
        if (netPay(emp) < 0 && loanDeductionTotal(emp) > emp.totalLoanDeduction) return "Loan deduction exceeds net pay";
        return null;
    };

    const hasErrors = useMemo(
        () => data.some((emp) => validationError(emp) !== null),
        [data, forms]
    );

    const downloadCsv = (csvData: PayrollCsvRow[], filename: string) => {
        const headers = ['Employee Name', 'Account Number', 'Net Pay Amount'];
        const csvContent = [
            headers.join(','),
            ...csvData.map(row => [
                `"${row.employeeName}"`,
                `"${row.accountNumber}"`,
                row.netPayAmount
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleGenerate = async () => {
        setBusy("generate");
        try {
            const inputs = Object.fromEntries(
                data.map((emp) => {
                    const form = formOf(emp);
                    return [emp.userId, {
                        bonusIds: form.bonusIds,
                        customBonus: num(form.customBonus),
                        customBonusNote: form.customBonusNote,
                        medicalAmount: form.medical.trim() === "" ? null : Number(form.medical),
                        loanDeductions: Object.fromEntries([
                            ...emp.activeLoans.map((l) => [l.id, autoLoanAmount(emp, l)] as const),
                            ...emp.manualLoans
                                .map((l) => [l.id, num(form.loanDeductions[l.id])] as const)
                                .filter(([, amount]) => amount > 0),
                        ]),
                    }];
                })
            );

            const csvRows = await saveDraftPayroll(payrollMonth, inputs);
            downloadCsv(csvRows, `payroll-${payrollMonth}-${new Date().toISOString().split('T')[0]}.csv`);
            setMode("generated");
            setSelected(new Set());
            toast.success(`Draft saved and CSV downloaded for ${csvRows.length} employee(s). Nothing has been paid yet — review, then send payslips.`);
            router.refresh();
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to generate payroll CSV");
        } finally {
            setBusy(null);
        }
    };

    const reportResults = (results: PayslipSendResult[], verb: string) => {
        const sent = results.filter((r) => r.status === "SENT").length;
        const emailFailed = results.filter((r) => r.status === "EMAIL_FAILED");
        const blocked = results.filter((r) => r.status === "BLOCKED");

        if (sent > 0) toast.success(`${sent} payslip email(s) ${verb}.`);
        emailFailed.forEach((r) => toast.error(`${r.email}: ${r.message}`));
        blocked.forEach((r) => toast.error(`${r.email}: ${r.message ?? "Blocked"}`));
    };

    const runSend = async (userIds: string[]) => {
        setBusy("send");
        try {
            const results = await finalizeAndSendPayslips(payrollMonth, userIds);
            reportResults(results, "sent");
            setSelected(new Set());
            router.refresh();
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to send payslips");
        } finally {
            setBusy(null);
            setConfirmSend(null);
        }
    };

    const runResend = async (userIds: string[]) => {
        setBusy("resend");
        try {
            const results = await resendPayslips(payrollMonth, userIds);
            reportResults(results, "re-sent");
            setSelectedResend(new Set());
            router.refresh();
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to resend payslips");
        } finally {
            setBusy(null);
        }
    };

    const sendable = data.filter((emp) => emp.draft).map((emp) => emp.userId);
    const toggleSelected = (userId: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId); else next.add(userId);
            return next;
        });
    const allSelected = sendable.length > 0 && sendable.every((id) => selected.has(id));

    const confirmEmployees = data.filter((emp) => confirmSend?.includes(emp.userId));
    const confirmTotal = confirmEmployees.reduce((sum, emp) => sum + (emp.draft?.netAmount ?? 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
                <div>
                    <h2 className="text-xl font-bold">Review for {month}/{year}</h2>
                    <p className="text-sm text-muted-foreground">
                        {locked
                            ? "CSV generated. Nothing is paid yet: wallet, medical claims and loans change only when a payslip is sent."
                            : "Choose bonus types or add a custom bonus, adjust the medical amount and type loan deductions, then generate the CSV."}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {locked ? (
                        <>
                            <Button variant="outline" onClick={() => setMode("edit")} disabled={busy !== null}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setConfirmSend(Array.from(selected))}
                                disabled={busy !== null || selected.size === 0}
                            >
                                <Send className="mr-2 h-4 w-4" />
                                Send selected ({selected.size})
                            </Button>
                            <Button
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => setConfirmSend(sendable)}
                                disabled={busy !== null || sendable.length === 0}
                            >
                                <Send className="mr-2 h-4 w-4" />
                                Send all ({sendable.length})
                            </Button>
                        </>
                    ) : (
                        <Button
                            size="lg"
                            onClick={handleGenerate}
                            disabled={busy !== null || data.length === 0 || hasErrors}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {busy === "generate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                            Generate CSV
                        </Button>
                    )}
                </div>
            </div>

            <div className="border rounded-lg bg-white shadow-sm overflow-x-auto text-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="w-10">
                                {locked && (
                                    <Checkbox
                                        checked={allSelected}
                                        disabled={sendable.length === 0}
                                        onCheckedChange={(checked) =>
                                            setSelected(checked ? new Set(sendable) : new Set())
                                        }
                                        aria-label="Select all"
                                    />
                                )}
                            </TableHead>
                            <TableHead className="font-semibold">Employee</TableHead>
                            <TableHead className="font-semibold text-right">Base</TableHead>
                            <TableHead className="font-semibold text-right">Allowances</TableHead>
                            <TableHead className="font-semibold text-right">Medical</TableHead>
                            <TableHead className="font-semibold">Bonuses</TableHead>
                            <TableHead className="font-semibold">Loan deduction</TableHead>
                            <TableHead className="font-semibold text-right">Wallet</TableHead>
                            <TableHead className="font-semibold text-right text-green-700">Net Pay</TableHead>
                            <TableHead className="font-semibold">Status</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={11} className="h-32 text-center text-muted-foreground italic">
                                    No employees left to pay for this period.
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.map((emp) => {
                                const form = formOf(emp);
                                const error = validationError(emp);
                                return (
                                    <TableRow key={emp.userId} className="hover:bg-muted/30 transition-colors">
                                        <TableCell>
                                            {locked && (
                                                <Checkbox
                                                    checked={selected.has(emp.userId)}
                                                    disabled={!emp.draft}
                                                    onCheckedChange={() => toggleSelected(emp.userId)}
                                                    aria-label={`Select ${emp.email}`}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">{emp.email}</TableCell>
                                        <TableCell className="text-right tabular-nums">৳{money(emp.baseSalary)}</TableCell>
                                        <TableCell className="text-right tabular-nums text-blue-600">
                                            +৳{money(emp.totalAllowances)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex flex-col items-end gap-1">
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    step="any"
                                                    className="h-8 w-28 text-right text-xs tabular-nums"
                                                    placeholder={String(emp.totalMedical)}
                                                    value={form.medical}
                                                    disabled={locked}
                                                    onChange={(e) => updateForm(emp.userId, { medical: e.target.value })}
                                                    aria-label={`Medical amount for ${emp.email}`}
                                                />
                                                <span className="text-[10px] text-muted-foreground">
                                                    Claimed ৳{money(emp.totalMedical)}
                                                    {form.medical.trim() !== "" && medicalAmount(emp) !== emp.totalMedical && (
                                                        <span className="text-orange-600 font-semibold"> · edited</span>
                                                    )}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1 min-w-44">
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button variant="outline" size="sm" className="h-8 text-[11px] px-2 justify-start">
                                                            <Gift className="mr-1 h-3 w-3" />
                                                            Bonus types ({form.bonusIds.length})
                                                            {form.bonusIds.length > 0 && (
                                                                <span className="ml-auto font-semibold text-green-700">
                                                                    ৳{money(bonusTotal(emp) - num(form.customBonus))}
                                                                </span>
                                                            )}
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent>
                                                        <DialogHeader>
                                                            <DialogTitle>Bonus types for {emp.email}</DialogTitle>
                                                            <DialogDescription>
                                                                {locked ? "Press Edit to change bonuses." : "Tick the bonus types to pay this month."}
                                                            </DialogDescription>
                                                        </DialogHeader>
                                                        <div className="space-y-3 py-2">
                                                            {emp.eligibleBonuses.length === 0 ? (
                                                                <p className="text-center text-muted-foreground italic py-2">No eligible bonus types for this branch.</p>
                                                            ) : (
                                                                emp.eligibleBonuses.map(bonus => (
                                                                    <div key={bonus.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                                                        <div className="flex items-center gap-3">
                                                                            <Checkbox
                                                                                id={`bonus-${emp.userId}-${bonus.id}`}
                                                                                checked={form.bonusIds.includes(bonus.id)}
                                                                                disabled={locked}
                                                                                onCheckedChange={() => toggleBonus(emp, bonus.id)}
                                                                            />
                                                                            <label htmlFor={`bonus-${emp.userId}-${bonus.id}`} className="flex flex-col cursor-pointer">
                                                                                <span className="font-semibold text-sm">{bonus.name}</span>
                                                                                <span className="text-[10px] text-muted-foreground">{bonus.type} ({bonus.value}{bonus.type === "PERCENTAGE" ? "%" : " FIXED"})</span>
                                                                            </label>
                                                                        </div>
                                                                        <div className="font-bold text-green-600">
                                                                            ৳{money(bonus.amount)}
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                    </DialogContent>
                                                </Dialog>
                                                <div className="grid grid-cols-5 gap-1">
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        step="any"
                                                        className="h-8 text-xs col-span-2"
                                                        placeholder="Custom ৳"
                                                        value={form.customBonus}
                                                        disabled={locked}
                                                        onChange={(e) => updateForm(emp.userId, { customBonus: e.target.value })}
                                                        aria-label={`Custom bonus for ${emp.email}`}
                                                    />
                                                    <Input
                                                        className="h-8 text-xs col-span-3"
                                                        placeholder="Label (Eid gift)"
                                                        value={form.customBonusNote}
                                                        disabled={locked}
                                                        onChange={(e) => updateForm(emp.userId, { customBonusNote: e.target.value })}
                                                        aria-label={`Custom bonus label for ${emp.email}`}
                                                    />
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {emp.activeLoans.length + emp.manualLoans.length === 0 ? (
                                                <span className="text-[10px] text-muted-foreground italic">No loans</span>
                                            ) : (
                                                <div className="flex flex-col gap-2 min-w-48">
                                                    {emp.activeLoans.map((loan) => (
                                                        <div key={loan.id} className="space-y-0.5">
                                                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                                                <span>EMI loan #{loan.id.slice(-6)}</span>
                                                                <span>Left ৳{money(loan.remainingPrincipal)}</span>
                                                            </div>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={loan.remainingPrincipal}
                                                                step="any"
                                                                className="h-8 text-xs tabular-nums"
                                                                placeholder={`Scheduled ৳${money(scheduledEmi(loan))}`}
                                                                value={form.loanDeductions[loan.id] ?? ""}
                                                                disabled={locked}
                                                                onChange={(e) =>
                                                                    updateForm(emp.userId, {
                                                                        loanDeductions: { ...form.loanDeductions, [loan.id]: e.target.value },
                                                                    })
                                                                }
                                                                aria-label={`Loan deduction for ${emp.email}`}
                                                            />
                                                            {loan.carryForward > 0 && (
                                                                <span className="text-[9px] text-orange-600 font-bold uppercase">Includes carry-forward</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {emp.manualLoans.map((loan) => (
                                                        <div key={loan.id} className="space-y-0.5">
                                                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                                                <span>Loan #{loan.id.slice(-6)}</span>
                                                                <span>Left ৳{money(loan.remainingPrincipal)}</span>
                                                            </div>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={loan.remainingPrincipal}
                                                                step="any"
                                                                className="h-8 text-xs tabular-nums"
                                                                placeholder="Deduct this month ৳"
                                                                value={form.loanDeductions[loan.id] ?? ""}
                                                                disabled={locked}
                                                                onChange={(e) =>
                                                                    updateForm(emp.userId, {
                                                                        loanDeductions: { ...form.loanDeductions, [loan.id]: e.target.value },
                                                                    })
                                                                }
                                                                aria-label={`Loan deduction for ${emp.email}`}
                                                            />
                                                        </div>
                                                    ))}
                                                    <div className="text-right text-[11px] text-destructive tabular-nums">
                                                        Total -৳{money(loanDeductionTotal(emp))}
                                                    </div>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            <span className={emp.walletBalance >= 0 ? "text-blue-600" : "text-red-600"}>
                                                {emp.walletBalance >= 0 ? "+" : ""}৳{money(emp.walletBalance)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums font-bold text-green-700 text-base">
                                            ৳{money(netPay(emp))}
                                            {error && <div className="text-[10px] font-normal text-destructive">{error}</div>}
                                        </TableCell>
                                        <TableCell>
                                            {emp.draft && locked ? (
                                                <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200">Draft</Badge>
                                            ) : emp.draft ? (
                                                <Badge variant="outline" className="text-muted-foreground">Editing</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-muted-foreground">Not generated</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {locked && emp.draft && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-[11px] px-2"
                                                    disabled={busy !== null}
                                                    onClick={() => setConfirmSend([emp.userId])}
                                                >
                                                    <Send className="mr-1 h-3 w-3" />
                                                    Send
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {finalized.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold">Paid this month ({finalized.length})</h3>
                            <p className="text-xs text-muted-foreground">Finalized. Figures are locked; you can only resend the payslip email.</p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy !== null || selectedResend.size === 0}
                            onClick={() => runResend(Array.from(selectedResend))}
                        >
                            {busy === "resend" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Resend selected ({selectedResend.size})
                        </Button>
                    </div>
                    <div className="border rounded-lg bg-white shadow-sm overflow-hidden text-sm">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="w-10">
                                        <Checkbox
                                            checked={finalized.every((f) => selectedResend.has(f.userId))}
                                            onCheckedChange={(checked) =>
                                                setSelectedResend(checked ? new Set(finalized.map((f) => f.userId)) : new Set())
                                            }
                                            aria-label="Select all paid"
                                        />
                                    </TableHead>
                                    <TableHead>Employee</TableHead>
                                    <TableHead className="text-right">Loan deduction</TableHead>
                                    <TableHead className="text-right">Net Pay</TableHead>
                                    <TableHead>Payslip email</TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {finalized.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedResend.has(row.userId)}
                                                onCheckedChange={() =>
                                                    setSelectedResend((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(row.userId)) next.delete(row.userId); else next.add(row.userId);
                                                        return next;
                                                    })
                                                }
                                                aria-label={`Select ${row.email}`}
                                            />
                                        </TableCell>
                                        <TableCell className="font-medium">{row.email}</TableCell>
                                        <TableCell className="text-right tabular-nums">৳{money(row.loanDeduction)}</TableCell>
                                        <TableCell className="text-right tabular-nums font-semibold">৳{money(row.netAmount)}</TableCell>
                                        <TableCell>
                                            {row.payslipSentAt ? (
                                                <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
                                                    Sent {formatDateTime12(row.payslipSentAt)}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-orange-50 text-orange-800 border-orange-200">
                                                    Not confirmed
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-[11px] px-2"
                                                disabled={busy !== null}
                                                onClick={() => runResend([row.userId])}
                                            >
                                                <RefreshCw className="mr-1 h-3 w-3" />
                                                Resend
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            <Dialog open={confirmSend !== null} onOpenChange={(open) => { if (!open && busy !== "send") setConfirmSend(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Send payslips for {confirmEmployees.length} employee(s)?</DialogTitle>
                        <DialogDescription>
                            This finalizes payroll for {payrollMonth} for the selected employees: wallet balances are cleared,
                            approved medical claims are marked paid, loan deductions are recorded, and the payslip PDF is
                            emailed. Finalized employees can no longer be edited.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="text-sm">
                        Total net pay: <span className="font-semibold">৳{money(confirmTotal)}</span>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmSend(null)} disabled={busy === "send"}>Cancel</Button>
                        <Button
                            className="bg-green-600 hover:bg-green-700"
                            disabled={busy === "send" || !confirmSend || confirmSend.length === 0}
                            onClick={() => confirmSend && runSend(confirmSend)}
                        >
                            {busy === "send" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Finalize & Send
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
