"use client";

import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, CalendarDays, Clock3, Filter, Search, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LateCheckinDashboardData } from "@/actions/late-checkin.actions";

interface BranchOption {
  id: string;
  name: string;
}

interface LateCheckinDashboardProps {
  title: string;
  description: string;
  initialData: LateCheckinDashboardData;
  branches: BranchOption[];
  basePath: string;
  employeeDetailPath: string;
  initialFilters: {
    branchId: string;
    fromDate: string;
    toDate: string;
    employeeSearch: string;
  };
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const currencyFormatter = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function LateCheckinDashboard({
  title,
  description,
  initialData,
  branches,
  basePath,
  employeeDetailPath,
  initialFilters,
}: LateCheckinDashboardProps) {
  const [branchId, setBranchId] = useState(initialFilters.branchId || "all");
  const [fromDate, setFromDate] = useState(initialFilters.fromDate);
  const [toDate, setToDate] = useState(initialFilters.toDate);
  const [employeeSearch, setEmployeeSearch] = useState(initialFilters.employeeSearch);
  const [loading, setLoading] = useState(false);

  const monthlySeriesKeys = Array.from(
    new Set(
      initialData.monthlyLateByBranch.flatMap((row) =>
        Object.keys(row).filter((key) => key !== "month")
      )
    )
  );

  const applyFilters = () => {
    setLoading(true);

    const params = new URLSearchParams();
    if (branchId && branchId !== "all") {
      params.set("branch", branchId);
    }
    if (fromDate) {
      params.set("from", fromDate);
    }
    if (toDate) {
      params.set("to", toDate);
    }
    if (employeeSearch.trim()) {
      params.set("search", employeeSearch.trim());
    }

    const queryString = params.toString();
    window.location.href = queryString ? `${basePath}?${queryString}` : basePath;
  };

  const clearFilters = () => {
    setBranchId("all");
    setFromDate("");
    setToDate("");
    setEmployeeSearch("");
    setLoading(true);
    window.location.href = basePath;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger>
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />

          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search employee"
              value={employeeSearch}
              onChange={(event) => setEmployeeSearch(event.target.value)}
            />
          </div>

          <div className="flex gap-2 md:col-span-2 lg:col-span-5">
            <Button onClick={applyFilters} disabled={loading}>
              {loading ? "Applying..." : "Apply Filters"}
            </Button>
            <Button variant="outline" onClick={clearFilters} disabled={loading}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock3 className="h-4 w-4" />
              Total Late Minutes
            </CardDescription>
            <CardTitle>{initialData.summary.totalLateMinutes}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Total Penalty Deduction
            </CardDescription>
            <CardTitle>{currencyFormatter.format(initialData.summary.totalPenaltyAmount)}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Total Late Check-ins
            </CardDescription>
            <CardTitle>{initialData.summary.totalLateCheckins}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Late Minutes by Branch</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {initialData.monthlyLateByBranch.length === 0 ? (
              <EmptyState message="No late check-in records for selected filters." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={initialData.monthlyLateByBranch}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {monthlySeriesKeys.map((key, index) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={CHART_COLORS[index % CHART_COLORS.length]}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total Penalty Amount by Branch</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {initialData.penaltyByBranch.length === 0 ? (
              <EmptyState message="No penalty records for selected filters." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={initialData.penaltyByBranch}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="branch" />
                  <YAxis />
                  <Tooltip formatter={(value) => currencyFormatter.format(Number(value))} />
                  <Bar dataKey="totalPenaltyAmount" fill={CHART_COLORS[0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employees</CardTitle>
          <CardDescription>
            Click an employee name to open detailed late check-in history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialData.employeeRows.length === 0 ? (
            <EmptyState message="No employees found for selected filters." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Total Late Minutes</TableHead>
                  <TableHead className="text-right">Total Penalty Amount</TableHead>
                  <TableHead className="text-right">Late Check-In Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialData.employeeRows.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell>
                      <Link
                        href={`${employeeDetailPath}/${row.userId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.employeeName}
                      </Link>
                    </TableCell>
                    <TableCell>{row.branch}</TableCell>
                    <TableCell className="text-right">{row.totalLateMinutes}</TableCell>
                    <TableCell className="text-right">{currencyFormatter.format(row.totalPenaltyAmount)}</TableCell>
                    <TableCell className="text-right">{row.lateCheckinCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
      <AlertCircle className="mb-2 h-5 w-5" />
      <p>{message}</p>
    </div>
  );
}