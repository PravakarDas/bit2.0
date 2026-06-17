"use client";

import { useEffect, useMemo, useState } from "react";
import { getActiveBranches } from "@/actions/branch.actions";
import {
  applyOvertimePayout,
  getEligibleEmployeesForOvertime,
  getLeaveEntitlementHistory,
  getOvertimePayoutHistory,
  getOvertimePayoutSummary,
} from "@/actions/overtime.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime12 } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import OvertimePayoutSummaryGrid from "@/components/shared/OvertimePayoutSummaryGrid";

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
  totalActualActiveTime: string;
  totalRequiredBreakTime: string;
  totalOfficeOvertimeUndertime: string;
  totalOfficeOvertimeMinutes: number;
  totalWorkFromHomeOvertime: string;
  totalWorkFromHomeMinutes: number;
  totalOvertimeUndertime: string;
  totalRequiredMinutes: number;
  totalOvertimeMinutes: number;
  totalActualActiveMinutes: number;
  totalRenewableLeaveRemainingDays: number;
  renewableLeaveMinutes: number;
  payableMinutes: number;
  perMinuteSalary: number;
  workingDaysInMonth: number;
  dailyWorkingMinutes: number;
  calculatedAmount: number;
  isPaid: boolean;
  paidAt: Date | null;
}

interface OvertimePayoutHistoryItem {
  id: string;
  year: number;
  totalRequiredActiveTime: string;
  totalRequiredBreakTime: string;
  totalOvertimeUndertime: string;
  totalRequiredMinutes: number;
  totalOvertimeMinutes: number;
  calculatedAmount: number;
  isPaid: boolean;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LeaveEntitlementHistoryItem {
  id: string;
  year: number;
  allocatedDays: number;
  usedDays: number;
  remainingDays: number;
  leaveType: {
    name: string;
    leaveResetPolicy: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export default function OvertimePayoutClient() {
  const currentYear = new Date().getFullYear();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [searchName, setSearchName] = useState<string>("");
  const [appliedSearchName, setAppliedSearchName] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payoutHistory, setPayoutHistory] = useState<OvertimePayoutHistoryItem[]>([]);
  const [leaveHistory, setLeaveHistory] = useState<LeaveEntitlementHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const years = useMemo(() => {
    const list = [];
    for (let i = 0; i < 6; i++) list.push(currentYear - i);
    return list;
  }, [currentYear]);

  const filteredEmployees = useMemo(() => {
    const keyword = appliedSearchName.trim().toLowerCase();
    if (!keyword) return employees;

    return employees.filter((emp) => {
      const fullName = `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim().toLowerCase();
      const email = emp.email.toLowerCase();
      return fullName.includes(keyword) || email.includes(keyword);
    });
  }, [employees, appliedSearchName]);

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
      setAppliedSearchName("");
      setSearchName("");
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
        setPayoutHistory([]);
        setLeaveHistory([]);
        return;
      }
      setLoading(true);
      try {
        const [summaryData, payoutHistoryData, leaveHistoryData] = await Promise.all([
          getOvertimePayoutSummary(selectedEmployee, selectedYear),
          getOvertimePayoutHistory(selectedEmployee),
          getLeaveEntitlementHistory(selectedEmployee),
        ]);

        setSummary(summaryData as Summary);
        setPayoutHistory(payoutHistoryData as OvertimePayoutHistoryItem[]);
        setLeaveHistory(leaveHistoryData as LeaveEntitlementHistoryItem[]);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load payout summary");
        setSummary(null);
        setPayoutHistory([]);
        setLeaveHistory([]);
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
        const [refreshedSummary, refreshedPayoutHistory, refreshedLeaveHistory] = await Promise.all([
          getOvertimePayoutSummary(summary.user.id, summary.year),
          getOvertimePayoutHistory(summary.user.id),
          getLeaveEntitlementHistory(summary.user.id),
        ]);
        setSummary(refreshedSummary as Summary);
        setPayoutHistory(refreshedPayoutHistory as OvertimePayoutHistoryItem[]);
        setLeaveHistory(refreshedLeaveHistory as LeaveEntitlementHistoryItem[]);
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
            <div className="flex gap-2">
              <Input
                value={searchName}
                onChange={(event) => setSearchName(event.target.value)}
                placeholder="Search by employee name"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setAppliedSearchName(searchName)}
              >
                Search
              </Button>
            </div>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {filteredEmployees.map(emp => (
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
              <OvertimePayoutSummaryGrid summary={summary} />

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

      <Card>
        <CardHeader>
          <CardTitle>OT/UT Payout History</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedEmployee ? (
            <div className="text-sm text-muted-foreground">Select an employee to view payout history.</div>
          ) : payoutHistory.length === 0 ? (
            <div className="text-sm text-muted-foreground">No yearly payout records found.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead>Total OT/UT</TableHead>
                    <TableHead>Required Minutes</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payoutHistory.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.year}</TableCell>
                      <TableCell className={item.totalOvertimeUndertime.startsWith("-") ? "text-red-600" : "text-green-600"}>
                        {item.totalOvertimeUndertime.startsWith("-") ? item.totalOvertimeUndertime : `+${item.totalOvertimeUndertime}`}
                      </TableCell>
                      <TableCell>{item.totalRequiredMinutes}</TableCell>
                      <TableCell className={item.calculatedAmount < 0 ? "text-red-600" : "text-green-600"}>
                        {formatCurrency(item.calculatedAmount)}
                      </TableCell>
                      <TableCell>
                        {item.isPaid ? <Badge variant="secondary">Paid</Badge> : <Badge variant="outline">Pending</Badge>}
                      </TableCell>
                      <TableCell>{formatDateTime12(item.paidAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leave Entitlement History</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedEmployee ? (
            <div className="text-sm text-muted-foreground">Select an employee to view leave history.</div>
          ) : leaveHistory.length === 0 ? (
            <div className="text-sm text-muted-foreground">No leave entitlement records found.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead>Allocated</TableHead>
                    <TableHead>Used</TableHead>
                    <TableHead>Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveHistory.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.year}</TableCell>
                      <TableCell>{item.leaveType.name}</TableCell>
                      <TableCell>{item.leaveType.leaveResetPolicy}</TableCell>
                      <TableCell>{item.allocatedDays}</TableCell>
                      <TableCell>{item.usedDays}</TableCell>
                      <TableCell>{item.remainingDays}</TableCell>
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
