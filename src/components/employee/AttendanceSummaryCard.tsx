import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export interface AttendanceSummaryData {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  onLeaveDays: number;
  totalRequiredTime: string;
  totalActualTime: string;
  totalOvertime: string;
}

interface AttendanceSummaryCardProps {
  summary: AttendanceSummaryData | null;
  latestProcessedDate: Date | string | null;
}

/**
 * Shared "Attendance Summary" block used by all three employee timeline views
 * (calendar, table, charts) so the numbers are identical everywhere.
 *
 * All counts come from processed records only (isProcessed === true), broken
 * down by status. Total Days = Present + Absent + On Leave (weekly-offs and
 * holidays are excluded). The latest processed date is the employee's most
 * recent processed day across all time, so they know how current the data is.
 */
export default function AttendanceSummaryCard({ summary, latestProcessedDate }: AttendanceSummaryCardProps) {
  const totalDays = summary?.totalDays ?? 0;
  const presentDays = summary?.presentDays ?? 0;
  const absentDays = summary?.absentDays ?? 0;
  const onLeaveDays = summary?.onLeaveDays ?? 0;
  const totalRequiredTime = summary?.totalRequiredTime ?? "00:00";
  const totalActualTime = summary?.totalActualTime ?? "00:00";
  const totalOvertime = summary?.totalOvertime ?? "00:00";

  const overtimeVariant =
    totalOvertime === "00:00" ? "secondary" : totalOvertime.startsWith("-") ? "destructive" : "default";
  const overtimeLabel =
    totalOvertime === "00:00" ? "On Time" : totalOvertime.startsWith("-") ? totalOvertime : `+${totalOvertime}`;

  const processedUpTo = latestProcessedDate ? format(new Date(latestProcessedDate), "PPP") : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Attendance Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <div className="text-2xl font-bold">{totalDays}</div>
            <div className="text-xs font-medium">Total Days</div>
            <div className="text-[10px] text-muted-foreground">Present + Absent + On Leave</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-2xl font-bold text-green-600">{presentDays}</div>
            <div className="text-xs font-medium">Present Days</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-2xl font-bold text-red-600">{absentDays}</div>
            <div className="text-xs font-medium">Absent Days</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-2xl font-bold text-amber-600">{onLeaveDays}</div>
            <div className="text-xs font-medium">On Leave Days</div>
          </div>
        </div>

        {/* Time totals (merged from the former Time Summary) */}
        <div className="space-y-2 border-t pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Required Time:</span>
            <span className="font-medium">{totalRequiredTime}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Actual Time:</span>
            <span className="font-medium">{totalActualTime}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Net Overtime/Undertime:</span>
            <Badge variant={overtimeVariant}>{overtimeLabel}</Badge>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Counts include processed attendance only.</span>
          <span className="font-medium text-foreground">
            {processedUpTo ? `Data processed up to: ${processedUpTo}` : "No processed data yet"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
