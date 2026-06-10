"use client";

import { useEffect, useMemo, useState } from "react";
import { getMyOvertimePayoutSummary, getMyOvertimePayoutHistory } from "@/actions/overtime.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import OvertimePayoutSummaryGrid from "@/components/shared/OvertimePayoutSummaryGrid";

type Summary = Awaited<ReturnType<typeof getMyOvertimePayoutSummary>>;
type PayoutHistory = Awaited<ReturnType<typeof getMyOvertimePayoutHistory>>;

export default function EmployeeOvertimePayoutClient() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [history, setHistory] = useState<PayoutHistory>([]);
  const [loading, setLoading] = useState(true);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < 6; i++) list.push(currentYear - i);
    return list;
  }, [currentYear]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [summaryResult, historyResult] = await Promise.all([
          getMyOvertimePayoutSummary(selectedYear),
          getMyOvertimePayoutHistory(),
        ]);
        if (!cancelled) {
          setSummary(summaryResult);
          setHistory(historyResult);
        }
      } catch (error) {
        console.error("Failed to load overtime payout summary:", error);
        if (!cancelled) toast.error("Failed to load your overtime payout summary");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYear]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>My OT/UT Payout ({selectedYear})</CardTitle>
            <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-200 h-10 rounded" />
              ))}
            </div>
          ) : summary ? (
            <OvertimePayoutSummaryGrid summary={summary} />
          ) : (
            <div className="text-sm text-muted-foreground">No data available for {selectedYear}.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OT/UT Payout History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-sm text-muted-foreground">No yearly payout records found.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead>Combined OT/UT</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.year}</TableCell>
                      <TableCell className={item.totalOvertimeUndertime.startsWith("-") ? "text-red-600" : "text-green-600"}>
                        {item.totalOvertimeUndertime.startsWith("-") ? item.totalOvertimeUndertime : `+${item.totalOvertimeUndertime}`}
                      </TableCell>
                      <TableCell className={item.calculatedAmount < 0 ? "text-red-600" : "text-green-600"}>
                        {formatCurrency(item.calculatedAmount)}
                      </TableCell>
                      <TableCell>
                        {item.isPaid ? <Badge variant="secondary">Paid</Badge> : <Badge variant="outline">Pending</Badge>}
                      </TableCell>
                      <TableCell>{item.paidAt ? new Date(item.paidAt).toLocaleString() : "--"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
