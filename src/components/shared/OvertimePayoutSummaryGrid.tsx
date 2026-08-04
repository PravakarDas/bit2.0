import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";

export interface OvertimePayoutSummaryData {
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    baseSalary: number;
  };
  workingDaysInMonth: number;
  dailyWorkingMinutes: number;
  perMinuteSalary: number;
  totalRequiredActiveTime: string;
  totalActualActiveTime: string;
  totalRequiredBreakTime: string;
  totalRequiredMinutes: number;
  totalOfficeOvertimeUndertime: string;
  totalWorkFromHomeOvertime: string;
  totalOvertimeUndertime: string;
  totalRenewableLeaveRemainingDays: number;
  renewableLeaveMinutes: number;
  payableMinutes: number;
  calculatedAmount: number;
  isPaid: boolean;
}

function minutesToTimeString(minutes: number): string {
  if (minutes === 0) return "00:00";
  const isNegative = minutes < 0;
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${isNegative ? "-" : ""}${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function signedClass(value: string): string {
  return value.startsWith("-") ? "text-red-600" : "text-green-600";
}

function signedLabel(value: string): string {
  return value.startsWith("-") ? value : `+${value}`;
}

/**
 * Shared OT/UT payout calculation summary, used on the admin
 * /admin/overtime-payouts page so the breakdown is identical everywhere it's shown.
 */
export default function OvertimePayoutSummaryGrid({ summary }: { summary: OvertimePayoutSummaryData }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-semibold">
          {summary.user.firstName && summary.user.lastName
            ? `${summary.user.firstName} ${summary.user.lastName}`
            : summary.user.email}
        </div>
        {summary.isPaid ? (
          <Badge variant="secondary">Already Paid</Badge>
        ) : (
          <Badge variant="outline">Pending</Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <div className="text-xs text-muted-foreground">Base Salary (Monthly)</div>
          <div className="text-lg font-semibold">{formatCurrency(summary.user.baseSalary || 0)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Working Days in Month</div>
          <div className="text-lg font-semibold">{summary.workingDaysInMonth}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Daily Working Time</div>
          <div className="text-lg font-semibold">
            {minutesToTimeString(summary.dailyWorkingMinutes)}{" "}
            <span className="text-xs font-normal text-muted-foreground">({summary.dailyWorkingMinutes} min)</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Per Minute Salary Value</div>
          <div className="text-lg font-semibold">{formatCurrency(summary.perMinuteSalary)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total Required Active Time</div>
          <div className="text-lg font-semibold">{summary.totalRequiredActiveTime}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total Actual Active Time</div>
          <div className="text-lg font-semibold">{summary.totalActualActiveTime}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total Required Break Time</div>
          <div className="text-lg font-semibold">{summary.totalRequiredBreakTime}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Office Work hour (Active time + Break Time)</div>
          <div className="text-lg font-semibold">{minutesToTimeString(summary.totalRequiredMinutes)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Office OT/UT</div>
          <div className={`text-lg font-semibold ${signedClass(summary.totalOfficeOvertimeUndertime)}`}>
            {signedLabel(summary.totalOfficeOvertimeUndertime)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total WorkFromHome</div>
          <div className={`text-lg font-semibold ${signedClass(summary.totalWorkFromHomeOvertime)}`}>
            {signedLabel(summary.totalWorkFromHomeOvertime)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Combined OT/UT</div>
          <div className={`text-lg font-semibold ${signedClass(summary.totalOvertimeUndertime)}`}>
            {signedLabel(summary.totalOvertimeUndertime)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Remaining Renewable Leaves</div>
          <div className="text-lg font-semibold">
            {summary.totalRenewableLeaveRemainingDays} day(s) = {minutesToTimeString(summary.renewableLeaveMinutes)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Payable Minutes (OT/UT + Leaves)</div>
          <div className="text-lg font-semibold text-blue-600">{minutesToTimeString(summary.payableMinutes)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Calculated Amount</div>
          <div className={`text-lg font-semibold ${summary.calculatedAmount < 0 ? "text-red-600" : "text-green-600"}`}>
            {formatCurrency(summary.calculatedAmount)}
          </div>
        </div>
      </div>
    </div>
  );
}
