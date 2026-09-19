"use client";

import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
    Building2,
    CalendarCheck,
    Car,
    FileDown,
    Flag,
    Gift,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Send,
    Trophy,
    Utensils,
    Wifi,
    X,
    type LucideIcon,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatDateTime12 } from "@/lib/utils";

type PayrollRow = Awaited<ReturnType<typeof getPayrollAggregation>>[number];
type FinalizedRow = Awaited<ReturnType<typeof getFinalizedPayrollForMonth>>[number];
type AutoLoan = PayrollRow["activeLoans"][number];
type ManualLoan = PayrollRow["manualLoans"][number];

/** scheduled = the EMI (0 for a manual-mode loan) · skip = 0 this month · custom = typed amount */
type LoanChoice = "scheduled" | "skip" | "custom";

/** Form state per employee (amounts are kept as text while typing). */
interface EmployeeForm {
    bonusIds: string[];
    customBonus: string;
    customBonusNote: string;
    /** "" = pay the approved claims total. */
    medical: string;
    loanChoice: Record<string, LoanChoice>;
    loanAmount: Record<string, string>;
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

// ---- look & feel helpers -------------------------------------------------

const PALETTE = [
    { chip: "bg-blue-50 text-blue-700 border-blue-200", solid: "bg-blue-100 text-blue-700" },
    { chip: "bg-green-50 text-green-700 border-green-200", solid: "bg-green-100 text-green-700" },
    { chip: "bg-orange-50 text-orange-700 border-orange-200", solid: "bg-orange-100 text-orange-700" },
    { chip: "bg-rose-50 text-rose-700 border-rose-200", solid: "bg-rose-100 text-rose-700" },
    { chip: "bg-purple-50 text-purple-700 border-purple-200", solid: "bg-purple-100 text-purple-700" },
    { chip: "bg-teal-50 text-teal-700 border-teal-200", solid: "bg-teal-100 text-teal-700" },
];

function paletteFor(key: string) {
    let hash = 0;
    for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return PALETTE[hash % PALETTE.length];
}

function bonusIcon(name: string): LucideIcon {
    const n = name.toLowerCase();
    if (/perform|target|achiev/.test(n)) return Trophy;
    if (/transport|travel|conveyance/.test(n)) return Car;
    if (/meal|food|lunch/.test(n)) return Utensils;
    if (/attend/.test(n)) return CalendarCheck;
    if (/project/.test(n)) return Flag;
    if (/internet|wifi|phone|mobile/.test(n)) return Wifi;
    return Gift;
}

function displayName(emp: PayrollRow) {
    return `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() || emp.email;
}

function initials(emp: PayrollRow) {
    const parts = displayName(emp).split(/[\s@]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

// ---- form <-> saved draft ------------------------------------------------

function formFromRow(emp: PayrollRow): EmployeeForm {
    const draft = emp.draft?.inputs;
    const loanChoice: Record<string, LoanChoice> = {};
    const loanAmount: Record<string, string> = {};

    for (const loan of emp.activeLoans) {
        const saved = draft?.loanDeductions?.[loan.id];
        const scheduled = loan.currentEmi + loan.carryForward;
        if (saved === undefined || saved === scheduled) loanChoice[loan.id] = "scheduled";
        else if (saved === 0) loanChoice[loan.id] = "skip";
        else {
            loanChoice[loan.id] = "custom";
            loanAmount[loan.id] = String(saved);
        }
    }
    for (const loan of emp.manualLoans) {
        const saved = draft?.loanDeductions?.[loan.id];
        if (saved !== undefined && saved > 0) {
            loanChoice[loan.id] = "custom";
            loanAmount[loan.id] = String(saved);
        } else {
            loanChoice[loan.id] = "scheduled";
        }
    }

    return {
        bonusIds: draft?.bonusIds ?? [],
        customBonus: draft && draft.customBonus > 0 ? String(draft.customBonus) : "",
        customBonusNote: draft?.customBonusNote ?? "",
        medical: draft && draft.medicalAmount !== null && draft.medicalAmount !== undefined ? String(draft.medicalAmount) : "",
        loanChoice,
        loanAmount,
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
    const [bonusDialogFor, setBonusDialogFor] = useState<string | null>(null);
    const [bonusSearch, setBonusSearch] = useState("");

    const locked = mode === "generated";
    const formOf = (emp: PayrollRow): EmployeeForm =>
        forms[emp.userId] ?? { bonusIds: [], customBonus: "", customBonusNote: "", medical: "", loanChoice: {}, loanAmount: {} };

    const updateForm = (userId: string, patch: Partial<EmployeeForm>) =>
        setForms((prev) => ({ ...prev, [userId]: { ...prev[userId], ...patch } }));

    const toggleBonus = (emp: PayrollRow, bonusId: string) => {
        if (locked) return;
        const form = formOf(emp);
        updateForm(emp.userId, {
            bonusIds: form.bonusIds.includes(bonusId) ? form.bonusIds.filter((id) => id !== bonusId) : [...form.bonusIds, bonusId],
        });
    };

    // ---- calculations (mirror the server) ----
    const medicalAmount = (emp: PayrollRow) => {
        const text = formOf(emp).medical.trim();
        return text === "" ? emp.totalMedical : Math.max(0, Number(text) || 0);
    };

    const scheduledEmi = (loan: AutoLoan) => loan.currentEmi + loan.carryForward;

    const autoLoanAmount = (emp: PayrollRow, loan: AutoLoan) => {
        const form = formOf(emp);
        const choice = form.loanChoice[loan.id] ?? "scheduled";
        if (choice === "skip") return 0;
        if (choice === "custom") return Number(form.loanAmount[loan.id]) || 0;
        return scheduledEmi(loan);
    };

    const manualLoanAmount = (emp: PayrollRow, loan: ManualLoan) => {
        const form = formOf(emp);
        return form.loanChoice[loan.id] === "custom" ? num(form.loanAmount[loan.id]) : 0;
    };

    const loanDeductionTotal = (emp: PayrollRow) =>
        emp.activeLoans.reduce((sum, l) => sum + autoLoanAmount(emp, l), 0) +
        emp.manualLoans.reduce((sum, l) => sum + manualLoanAmount(emp, l), 0);

    const typeBonusTotal = (emp: PayrollRow) => {
        const form = formOf(emp);
        return emp.eligibleBonuses.filter((b) => form.bonusIds.includes(b.id)).reduce((sum, b) => sum + b.amount, 0);
    };

    const bonusTotal = (emp: PayrollRow) => typeBonusTotal(emp) + num(formOf(emp).customBonus);

    const netPay = (emp: PayrollRow) =>
        emp.baseSalary + emp.totalAllowances + medicalAmount(emp) + bonusTotal(emp) + emp.walletBalance - loanDeductionTotal(emp);

    // Returns a message when this employee's figures can't be saved.
    const validationError = (emp: PayrollRow): string | null => {
        const form = formOf(emp);
        if (num(form.customBonus) > 0 && !form.customBonusNote.trim()) return "Custom bonus needs a label";
        if (form.medical.trim() !== "" && Number(form.medical) < 0) return "Medical can't be negative";
        for (const loan of emp.activeLoans) {
            if (form.loanChoice[loan.id] === "custom" && Number(form.loanAmount[loan.id]) < 0) return "Loan deduction can't be negative";
            if (autoLoanAmount(emp, loan) > loan.remainingPrincipal) return "Loan deduction exceeds remaining balance";
        }
        for (const loan of emp.manualLoans) {
            if (form.loanChoice[loan.id] === "custom" && Number(form.loanAmount[loan.id]) < 0) return "Loan deduction can't be negative";
            if (manualLoanAmount(emp, loan) > loan.remainingPrincipal) return "Loan deduction exceeds remaining balance";
        }
        if (netPay(emp) < 0 && loanDeductionTotal(emp) > emp.totalLoanDeduction) return "Loan deduction exceeds net pay";
        return null;
    };

    const hasErrors = data.some((emp) => validationError(emp) !== null);

    // ---- actions ----
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
                                .map((l) => [l.id, manualLoanAmount(emp, l)] as const)
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
    const bonusEmp = data.find((emp) => emp.userId === bonusDialogFor) ?? null;
    const openBonusDialog = (userId: string) => {
        setBonusSearch("");
        setBonusDialogFor(userId);
    };

    // ---- cells ----
    const renderBonuses = (emp: PayrollRow) => {
        const form = formOf(emp);
        const custom = num(form.customBonus);
        const applied = emp.eligibleBonuses.filter((b) => form.bonusIds.includes(b.id));
        return (
            <div className="w-64 rounded-xl border bg-slate-50/60 p-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                    {applied.map((bonus) => {
                        const Icon = bonusIcon(bonus.name);
                        return (
                            <span
                                key={bonus.id}
                                title={`${bonus.name} — ${bonus.type === "PERCENTAGE" ? `${bonus.value}%` : "fixed"}`}
                                className={cn("flex items-center gap-1.5 rounded-lg border px-2 py-1", paletteFor(bonus.name).chip)}
                            >
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="leading-tight">
                                    <span className="block text-[10px]">{bonus.name}</span>
                                    <span className="block text-xs font-semibold">৳{money(bonus.amount)}</span>
                                </span>
                                {!locked && (
                                    <button
                                        type="button"
                                        onClick={() => toggleBonus(emp, bonus.id)}
                                        aria-label={`Remove ${bonus.name}`}
                                        className="ml-0.5 rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-black/5"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </span>
                        );
                    })}

                    {custom > 0 && (
                        <span className={cn("flex items-center gap-1.5 rounded-lg border px-2 py-1", paletteFor("custom").chip)}>
                            <Gift className="h-3.5 w-3.5 shrink-0" />
                            <span className="leading-tight">
                                <span className="block text-[10px]">{form.customBonusNote || "Custom bonus"}</span>
                                <span className="block text-xs font-semibold">৳{money(custom)}</span>
                            </span>
                            {!locked && (
                                <button
                                    type="button"
                                    onClick={() => updateForm(emp.userId, { customBonus: "", customBonusNote: "" })}
                                    aria-label="Remove custom bonus"
                                    className="ml-0.5 rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-black/5"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </span>
                    )}

                    {applied.length === 0 && custom === 0 && (
                        <span className="px-1 py-1 text-[11px] italic text-muted-foreground">No bonus added</span>
                    )}
                </div>

                {!locked && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-full border-dashed text-[11px]"
                        onClick={() => openBonusDialog(emp.userId)}
                    >
                        <Plus className="mr-1 h-3 w-3" /> Add bonus
                    </Button>
                )}

                <div className="flex items-center justify-between rounded-lg bg-slate-100 px-2 py-1.5">
                    <span className="text-[11px] font-medium">Total Bonuses</span>
                    <span className="text-sm font-bold text-blue-700 tabular-nums">৳{money(bonusTotal(emp))}</span>
                </div>
            </div>
        );
    };

    const choiceControl = (
        emp: PayrollRow,
        loanId: string,
        isAuto: boolean,
        remaining: number,
        title: string,
        detail: string
    ) => {
        const form = formOf(emp);
        const choice = form.loanChoice[loanId] ?? "scheduled";
        return (
            <div key={loanId} className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground">{title}</div>
                <Select
                    value={choice}
                    disabled={locked}
                    onValueChange={(value) =>
                        updateForm(emp.userId, { loanChoice: { ...form.loanChoice, [loanId]: value as LoanChoice } })
                    }
                >
                    <SelectTrigger className="h-9 w-full bg-white text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="scheduled">{isAuto ? "Scheduled" : "No deduction"}</SelectItem>
                        {isAuto && <SelectItem value="skip">Skip this month</SelectItem>}
                        <SelectItem value="custom">Custom amount</SelectItem>
                    </SelectContent>
                </Select>
                {choice === "custom" && (
                    <Input
                        type="number"
                        min={0}
                        max={remaining}
                        step="any"
                        className="h-8 text-xs tabular-nums"
                        placeholder="Amount ৳"
                        value={form.loanAmount[loanId] ?? ""}
                        disabled={locked}
                        onChange={(e) =>
                            updateForm(emp.userId, { loanAmount: { ...form.loanAmount, [loanId]: e.target.value } })
                        }
                        aria-label={`Loan deduction for ${emp.email}`}
                    />
                )}
                <div className="text-[11px] text-muted-foreground">{detail}</div>
            </div>
        );
    };

    const renderLoans = (emp: PayrollRow) => {
        if (emp.activeLoans.length + emp.manualLoans.length === 0) {
            return (
                <div className="w-52">
                    <Select disabled>
                        <SelectTrigger className="h-9 w-full bg-slate-50 text-sm">
                            <SelectValue placeholder="No loan" />
                        </SelectTrigger>
                        <SelectContent />
                    </Select>
                </div>
            );
        }
        const total = loanDeductionTotal(emp);
        return (
            <div className="w-52 space-y-2">
                {emp.activeLoans.map((loan) =>
                    choiceControl(
                        emp, loan.id, true, loan.remainingPrincipal,
                        emp.activeLoans.length + emp.manualLoans.length > 1 ? `EMI loan #${loan.id.slice(-6)}` : "",
                        `EMI: ৳${money(scheduledEmi(loan))}  |  Left: ৳${money(loan.remainingPrincipal)}`
                    )
                )}
                {emp.manualLoans.map((loan) =>
                    choiceControl(
                        emp, loan.id, false, loan.remainingPrincipal,
                        `Loan #${loan.id.slice(-6)}`,
                        `Issued: ৳${money(loan.issuedAmount)}  |  Left: ৳${money(loan.remainingPrincipal)}`
                    )
                )}
                <div className="inline-block rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600 tabular-nums">
                    Total: ৳{money(total)}
                </div>
            </div>
        );
    };

    const columns = 11;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white p-4 rounded-2xl border shadow-sm">
                <div>
                    <h2 className="text-xl font-bold">Review for {month}/{year}</h2>
                    <p className="text-sm text-muted-foreground">
                        {locked
                            ? "CSV generated. Nothing is paid yet: wallet, medical claims and loans change only when a payslip is sent."
                            : "Tap bonus chips or add a custom bonus, adjust medical, choose loan deductions, then generate the CSV."}
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

            <div className="rounded-2xl border bg-white shadow-sm overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50 border-b">
                            <TableHead className="w-10 pl-4">
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
                            <TableHead className="font-semibold">Branch</TableHead>
                            <TableHead className="font-semibold text-right">Base</TableHead>
                            <TableHead className="font-semibold text-right">Allowances</TableHead>
                            <TableHead className="font-semibold text-center">Medical</TableHead>
                            <TableHead className="font-semibold">Bonuses</TableHead>
                            <TableHead className="font-semibold">Loan deduction</TableHead>
                            <TableHead className="font-semibold text-right">Wallet</TableHead>
                            <TableHead className="font-semibold text-center text-green-700">Net Pay</TableHead>
                            <TableHead className="font-semibold text-center pr-4">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={columns} className="h-32 text-center text-muted-foreground italic">
                                    No employees left to pay for this period.
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.map((emp) => {
                                const form = formOf(emp);
                                const error = validationError(emp);
                                const net = netPay(emp);
                                const avatar = paletteFor(emp.userId).solid;
                                const branch = paletteFor(emp.branchName ?? "none").chip;
                                return (
                                    <TableRow key={emp.userId} className="align-top hover:bg-slate-50/50">
                                        <TableCell className="pl-4 pt-6">
                                            {locked && (
                                                <Checkbox
                                                    checked={selected.has(emp.userId)}
                                                    disabled={!emp.draft}
                                                    onCheckedChange={() => toggleSelected(emp.userId)}
                                                    aria-label={`Select ${emp.email}`}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex items-center gap-3 min-w-44">
                                                <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold", avatar)}>
                                                    {initials(emp)}
                                                </div>
                                                <div className="leading-tight">
                                                    <div className="font-semibold">{displayName(emp)}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {emp.designationName || emp.email}
                                                    </div>
                                                    {emp.designationName && (
                                                        <div className="text-[10px] text-muted-foreground/80">{emp.email}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="pt-6">
                                            {emp.branchName ? (
                                                <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium", branch)}>
                                                    <Building2 className="h-3.5 w-3.5" />
                                                    {emp.branchName}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="pt-6 text-right tabular-nums font-semibold text-base">
                                            ৳{money(emp.baseSalary)}
                                        </TableCell>
                                        <TableCell className="pt-6 text-right tabular-nums font-semibold text-blue-600">
                                            +{money(emp.totalAllowances)}
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex flex-col items-center gap-1">
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    step="any"
                                                    className="h-10 w-28 text-center tabular-nums"
                                                    placeholder={String(emp.totalMedical)}
                                                    value={form.medical}
                                                    disabled={locked}
                                                    onChange={(e) => updateForm(emp.userId, { medical: e.target.value })}
                                                    aria-label={`Medical amount for ${emp.email}`}
                                                />
                                                <span className="text-[11px] text-muted-foreground">
                                                    Claimed: {money(emp.totalMedical)}
                                                    {form.medical.trim() !== "" && medicalAmount(emp) !== emp.totalMedical && (
                                                        <span className="text-orange-600 font-semibold"> · edited</span>
                                                    )}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">{renderBonuses(emp)}</TableCell>
                                        <TableCell className="py-4">{renderLoans(emp)}</TableCell>
                                        <TableCell className="pt-6 text-right tabular-nums font-semibold">
                                            <span className={emp.walletBalance < 0 ? "text-red-600" : "text-blue-600"}>
                                                {emp.walletBalance >= 0 ? "+" : "-"}{money(Math.abs(emp.walletBalance))}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex flex-col items-center gap-1">
                                                <div className={cn(
                                                    "rounded-xl px-4 py-3 text-lg font-bold tabular-nums",
                                                    net < 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                                                )}>
                                                    ৳{money(Math.round(net * 100) / 100)}
                                                </div>
                                                {error && <div className="max-w-36 text-center text-[10px] text-destructive">{error}</div>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4 pr-4">
                                            <div className="flex flex-col items-center gap-2">
                                                {emp.draft && locked ? (
                                                    <span className="rounded-lg bg-yellow-50 px-3 py-2 text-xs font-medium text-yellow-800">Draft</span>
                                                ) : emp.draft ? (
                                                    <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">Editing</span>
                                                ) : (
                                                    <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">Not generated</span>
                                                )}
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
                                            </div>
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
                    <div className="rounded-2xl border bg-white shadow-sm overflow-x-auto text-sm">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50 hover:bg-slate-50">
                                    <TableHead className="w-10 pl-4">
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
                                        <TableCell className="pl-4">
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
                                        <TableCell>
                                            <div className="font-medium">{row.name || row.email}</div>
                                            {row.name && <div className="text-xs text-muted-foreground">{row.email}</div>}
                                        </TableCell>
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

            {/* Add bonus: pick bonus types + optional one-off custom bonus */}
            <Dialog open={bonusEmp !== null} onOpenChange={(open) => { if (!open) setBonusDialogFor(null); }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Add bonus — {bonusEmp ? displayName(bonusEmp) : ""}</DialogTitle>
                        <DialogDescription>Tick the bonus types to pay this month, or add a one-off custom bonus.</DialogDescription>
                    </DialogHeader>
                    {bonusEmp && (() => {
                        const form = formOf(bonusEmp);
                        const query = bonusSearch.trim().toLowerCase();
                        const visible = bonusEmp.eligibleBonuses.filter((b) => b.name.toLowerCase().includes(query));
                        return (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Input
                                        placeholder={`Search ${bonusEmp.eligibleBonuses.length} bonus types…`}
                                        value={bonusSearch}
                                        onChange={(e) => setBonusSearch(e.target.value)}
                                    />
                                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                        {bonusEmp.eligibleBonuses.length === 0 ? (
                                            <p className="py-4 text-center text-sm italic text-muted-foreground">No eligible bonus types for this branch.</p>
                                        ) : visible.length === 0 ? (
                                            <p className="py-4 text-center text-sm italic text-muted-foreground">No bonus type matches “{bonusSearch}”.</p>
                                        ) : (
                                            visible.map((bonus) => {
                                                const Icon = bonusIcon(bonus.name);
                                                return (
                                                    <label
                                                        key={bonus.id}
                                                        htmlFor={`bonus-${bonusEmp.userId}-${bonus.id}`}
                                                        className="flex cursor-pointer items-center justify-between rounded-lg border p-3 hover:bg-muted/50"
                                                    >
                                                        <span className="flex items-center gap-3">
                                                            <Checkbox
                                                                id={`bonus-${bonusEmp.userId}-${bonus.id}`}
                                                                checked={form.bonusIds.includes(bonus.id)}
                                                                onCheckedChange={() => toggleBonus(bonusEmp, bonus.id)}
                                                            />
                                                            <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", paletteFor(bonus.name).solid)}>
                                                                <Icon className="h-4 w-4" />
                                                            </span>
                                                            <span className="leading-tight">
                                                                <span className="block text-sm font-semibold">{bonus.name}</span>
                                                                <span className="block text-[10px] text-muted-foreground">
                                                                    {bonus.type} ({bonus.value}{bonus.type === "PERCENTAGE" ? "%" : " fixed"})
                                                                </span>
                                                            </span>
                                                        </span>
                                                        <span className="font-bold text-green-600 tabular-nums">৳{money(bonus.amount)}</span>
                                                    </label>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2 rounded-lg border p-3">
                                    <Label className="text-sm font-semibold">Custom bonus (this month only)</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <Input
                                            type="number"
                                            min={0}
                                            step="any"
                                            placeholder="Amount ৳"
                                            value={form.customBonus}
                                            onChange={(e) => updateForm(bonusEmp.userId, { customBonus: e.target.value })}
                                        />
                                        <Input
                                            className="col-span-2"
                                            placeholder="Label, e.g. Eid gift"
                                            value={form.customBonusNote}
                                            onChange={(e) => updateForm(bonusEmp.userId, { customBonusNote: e.target.value })}
                                        />
                                    </div>
                                    {num(form.customBonus) > 0 && !form.customBonusNote.trim() && (
                                        <p className="text-xs text-destructive">A label is required for a custom bonus.</p>
                                    )}
                                </div>

                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Total bonuses</span>
                                    <span className="font-bold text-blue-700 tabular-nums">৳{money(bonusTotal(bonusEmp))}</span>
                                </div>
                            </div>
                        );
                    })()}
                    <DialogFooter>
                        <Button onClick={() => setBonusDialogFor(null)}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
