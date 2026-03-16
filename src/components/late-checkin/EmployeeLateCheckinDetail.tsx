"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, CalendarDays, Clock3, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EmployeeLateCheckinData } from "@/actions/late-checkin.actions";

interface EmployeeLateCheckinDetailProps {
  data: EmployeeLateCheckinData;
  title: string;
  description: string;
  basePath: string;
  backHref?: string;
  initialFilters: {
    fromDate: string;
    toDate: string;
  };
}

const currencyFormatter = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PAGE_SIZE = 20;

export function EmployeeLateCheckinDetail({
  data,
  title,
  description,
  basePath,
  backHref,
  initialFilters,
}: EmployeeLateCheckinDetailProps) {
  const [fromDate, setFromDate] = useState(initialFilters.fromDate);
  const [toDate, setToDate] = useState(initialFilters.toDate);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(data.records.length / PAGE_SIZE));

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return data.records.slice(start, start + PAGE_SIZE);
  }, [data.records, page]);

  const applyFilters = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fromDate) {
      params.set("from", fromDate);
    }
    if (toDate) {
      params.set("to", toDate);
    }

    const queryString = params.toString();
    window.location.href = queryString ? `${basePath}?${queryString}` : basePath;
  };

  const clearFilters = () => {
    setFromDate("");
    setToDate("");
    setLoading(true);
    window.location.href = basePath;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.employee.name} • {data.employee.branch}
          </p>
        </div>

        {backHref ? (
          <Button variant="outline" asChild>
            <Link href={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Date Filter</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          <Button onClick={applyFilters} disabled={loading}>
            {loading ? "Applying..." : "Apply Filter"}
          </Button>
          <Button variant="outline" onClick={clearFilters} disabled={loading}>
            Clear
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock3 className="h-4 w-4" />
              Total Late Minutes
            </CardDescription>
            <CardTitle>{data.summary.totalLateMinutes}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Total Penalty Deduction
            </CardDescription>
            <CardTitle>{currencyFormatter.format(data.summary.totalPenaltyAmount)}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Total Late Days
            </CardDescription>
            <CardTitle>{data.summary.totalLateDays}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Late Minutes by Date</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {data.chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No late check-in records for selected date range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="lateMinutes" fill="var(--chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detailed Late Check-Ins</CardTitle>
          <CardDescription>Showing {data.records.length} record(s) total.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Work Date</TableHead>
                <TableHead>Required Check-In</TableHead>
                <TableHead>Actual Check-In</TableHead>
                <TableHead className="text-right">Late Minutes</TableHead>
                <TableHead className="text-right">Penalty Deduction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.workDate}</TableCell>
                  <TableCell>{row.requiredCheckInTime}</TableCell>
                  <TableCell>{row.actualCheckInTime}</TableCell>
                  <TableCell className="text-right">{row.lateMinutes}</TableCell>
                  <TableCell className="text-right">{currencyFormatter.format(row.penaltyAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 ? (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}