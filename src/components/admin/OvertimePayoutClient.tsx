"use client";

import { useEffect, useMemo, useState } from "react";
import { getActiveBranches } from "@/actions/branch.actions";
import { applyOvertimePayout, getEligibleEmployeesForOvertime, getOvertimePayoutSummary } from "@/actions/overtime.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";

interface Branch {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  branchId: string | null;
}

interface Summary {
  user: {
    id: string;
    baseSalary: number;
    firstName: string | null;
    lastName: string | null;
    email: string;
    branchId: string | null;
  };
  year: number;
  totalRequiredActiveTime: string;
  totalRequiredBreakTime: string;
  totalOvertimeUndertime: string;
  totalRequiredMinutes: number;
  totalOvertimeMinutes: number;
  calculatedAmount: number;
  isPaid: boolean;
  paidAt: Date | null;
}

export default function OvertimePayoutClient() {
  const currentYear = new Date().getFullYear();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const years = useMemo(() => {
    const list = [];
    for (let i = 0; i < 6; i++) list.push(currentYear - i);
    return list;
  }, [currentYear]);

  useEffect(() => {
    const loadBranches = async () => {
      const data = await getActiveBranches();
      setBranches(data);
    };
    loadBranches();
  }, []);

  useEffect(() => {
    const loadEmployees = async () => {
      const branchId = selectedBranch === "all" ? undefined : selectedBranch;
      const data = await getEligibleEmployeesForOvertime(branchId);
      setEmployees(data as Employee[]);
      if (selectedEmployee && !data.find((emp: Employee) => emp.id === selectedEmployee)) {
        setSelectedEmployee("");
        setSummary(null);
      }
    };
    loadEmployees();
  }, [selectedBranch, selectedEmployee]);

  useEffect(() => {
    const loadSummary = async () => {
      if (!selectedEmployee) {
        setSummary(null);
        return;
      }
      setLoading(true);
      try {
        const data = await getOvertimePayoutSummary(selectedEmployee, selectedYear);
        setSummary(data as Summary);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load payout summary");
        setSummary(null);
      } finally {
        setLoading(false);
      }
    };
    loadSummary();
  }, [selectedEmployee, selectedYear]);

  const handleApply = async () => {
    if (!summary) return;
    setApplying(true);
    try {
      const result = await applyOvertimePayout(summary.user.id, summary.year);
      if (result.success) {
        toast.success("Yearly OT/UT adjustment applied to wallet");
        const refreshed = await getOvertimePayoutSummary(summary.user.id, summary.year);
        setSummary(refreshed as Summary);
      } else {
        toast.error(result.error || "Failed to apply payout");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to apply payout");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Yearly OT/UT Payment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Branch</label>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger>
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map(branch => (
                  <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Employee</label>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.firstName && emp.lastName ? `${emp.firstName} ${emp.lastName}` : emp.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Year</label>
            <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
              <SelectTrigger>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {years.map(year => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calculation Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {!summary && (
            <div className="text-sm text-muted-foreground">Select an employee to view the calculation.</div>
          )}

          {summary && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-semibold">
                  {summary.user.firstName && summary.user.lastName
                    ? `${summary.user.firstName} ${summary.user.lastName}`
                    : summary.user.email}
                </div>
                {summary.isPaid && (
                  <Badge variant="secondary">Already Paid</Badge>
                )}
                {!summary.isPaid && (
                  <Badge variant="outline">Pending</Badge>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Base Salary (Monthly)</div>
                  <div className="text-lg font-semibold">{formatCurrency(summary.user.baseSalary || 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Required Active Time</div>
                  <div className="text-lg font-semibold">{summary.totalRequiredActiveTime}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Required Break Time</div>
                  <div className="text-lg font-semibold">{summary.totalRequiredBreakTime}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total OT/UT</div>
                  <div className={`text-lg font-semibold ${summary.totalOvertimeUndertime.startsWith("-") ? "text-red-600" : "text-green-600"}`}>
                    {summary.totalOvertimeUndertime.startsWith("-") ? summary.totalOvertimeUndertime : `+${summary.totalOvertimeUndertime}`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Calculated Amount</div>
                  <div className={`text-lg font-semibold ${summary.calculatedAmount < 0 ? "text-red-600" : "text-green-600"}`}>
                    {formatCurrency(summary.calculatedAmount)}
                  </div>
                </div>
              </div>

              {summary.isPaid && (
                <div className="text-sm text-amber-600">
                  This year has already been paid. You cannot apply it again.
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleApply} disabled={loading || applying || summary.isPaid}>
                  {applying ? "Applying..." : "Apply to Wallet"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
