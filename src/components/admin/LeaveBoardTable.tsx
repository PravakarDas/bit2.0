"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { LeaveBoardData } from "@/actions/leave-board.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface LeaveBoardTableProps {
  title: string;
  description: string;
  basePath: string;
  data: LeaveBoardData;
}

export function LeaveBoardTable({ title, description, basePath, data }: LeaveBoardTableProps) {
  const [expandedEmployees, setExpandedEmployees] = useState<Record<string, boolean>>({});
  const hasActiveFilters = data.filters.search.length > 0 || data.filters.branchId !== "all";
  const employeeProfileBasePath = basePath.startsWith("/manager") ? "/manager/employees" : "/admin/employees";
  const leaveTypeById = useMemo(() => new Map(data.leaveTypes.map((leaveType) => [leaveType.id, leaveType])), [data.leaveTypes]);

  const sortedRows = useMemo(
    () => [...data.rows].sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
    [data.rows]
  );

  const toggleExpanded = (userId: string) => {
    setExpandedEmployees((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={basePath} method="get" className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-xs space-y-2">
              <label htmlFor="search" className="text-sm font-medium">
                Search Employee
              </label>
              <Input
                id="search"
                name="search"
                defaultValue={data.filters.search}
                placeholder="Search by name or email"
              />
            </div>

            <div className="w-full max-w-xs space-y-2">
              <label htmlFor="branch" className="text-sm font-medium">
                Branch
              </label>
              <select
                id="branch"
                name="branch"
                defaultValue={data.filters.branchId}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <option value="all">All Branches</option>
                {data.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit">Apply</Button>
            {hasActiveFilters ? (
              <Button asChild type="button" variant="outline">
                <Link href={basePath}>Reset</Link>
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Leave Board ({data.currentYear}) - {data.rows.length} Employees
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedRows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No employees found for the selected filters.
            </div>
          ) : (
            <div className="columns-1 gap-4 md:columns-2">
              {sortedRows.map((row) => {
                const isExpanded = !!expandedEmployees[row.userId];
                const showAbsentSummary = row.totals.remaining <= 0 && row.absent > 0;
                const assignedLeaveTypes = row.assignedLeaveTypeIds
                  .map((leaveTypeId) => leaveTypeById.get(leaveTypeId))
                  .filter((leaveType): leaveType is NonNullable<typeof leaveType> => !!leaveType);

                return (
                  <div key={row.userId} className="mb-4 break-inside-avoid rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(row.userId)}
                            className="text-muted-foreground hover:text-foreground mt-0.5"
                            aria-label={isExpanded ? `Collapse ${row.employeeName}` : `Expand ${row.employeeName}`}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>

                          <Link
                            href={`${employeeProfileBasePath}/${row.userId}`}
                            className="truncate font-medium text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {row.employeeName}
                          </Link>

                          <span
                            className={
                              showAbsentSummary
                                ? "shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-sm font-semibold text-red-700"
                                : "shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-sm font-semibold text-green-700"
                            }
                          >
                            {showAbsentSummary ? `(-${row.absent})` : `(${row.totals.used}/${row.totals.total})`}
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          <span>{row.branchName}</span>
                          <span className="mx-1">•</span>
                          <span className="truncate">{row.employeeEmail}</span>
                        </div>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="mt-4 space-y-2">
                        {assignedLeaveTypes.length === 0 ? (
                          <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                            No leave types are assigned for this employee in {data.currentYear}.
                          </div>
                        ) : (
                          assignedLeaveTypes.map((leaveType) => {
                            const metric = row.leaveByType[leaveType.id] ?? { total: 0, used: 0, remaining: 0 };

                            return (
                              <div
                                key={`${row.userId}:${leaveType.id}`}
                                className="grid grid-cols-12 items-center rounded-md border bg-muted/30 px-3 py-2 text-sm"
                              >
                                <div className="col-span-12 font-medium sm:col-span-4">{leaveType.name}</div>
                                <div className="col-span-4 text-right text-muted-foreground sm:col-span-2">
                                  T: <span className="font-semibold text-foreground">{metric.total}</span>
                                </div>
                                <div className="col-span-4 text-right text-muted-foreground sm:col-span-2">
                                  U: <span className="font-semibold text-foreground">{metric.used}</span>
                                </div>
                                <div className="col-span-4 text-right text-muted-foreground sm:col-span-4">
                                  R: <span className="font-semibold text-foreground">{metric.remaining}</span>
                                </div>
                              </div>
                            );
                          })
                        )}

                        <div className="grid grid-cols-12 items-center rounded-md border border-dashed px-3 py-2 text-sm font-medium">
                          <div className="col-span-12 sm:col-span-4">Total</div>
                          <div className="col-span-4 text-right sm:col-span-2">T: {row.totals.total}</div>
                          <div className="col-span-4 text-right sm:col-span-2">U: {row.totals.used}</div>
                          <div className="col-span-4 text-right sm:col-span-4">R: {row.totals.remaining}</div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}