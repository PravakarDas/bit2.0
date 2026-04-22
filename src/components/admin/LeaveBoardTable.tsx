import Link from "next/link";
import { Fragment } from "react";
import type { LeaveBoardData } from "@/actions/leave-board.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface LeaveBoardTableProps {
  title: string;
  description: string;
  basePath: string;
  data: LeaveBoardData;
}

export function LeaveBoardTable({ title, description, basePath, data }: LeaveBoardTableProps) {
  const totalColumnCount = 2 + data.leaveTypes.length * 3 + 3 + 1;
  const hasActiveFilters = data.filters.search.length > 0 || data.filters.branchId !== "all";

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
          <form method="get" className="flex flex-wrap items-end gap-3">
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead rowSpan={2}>Employee</TableHead>
                  <TableHead rowSpan={2}>Branch</TableHead>
                  {data.leaveTypes.map((leaveType) => (
                    <TableHead key={leaveType.id} colSpan={3} className="text-center">
                      {leaveType.name}
                    </TableHead>
                  ))}
                  <TableHead colSpan={3} className="text-center">
                    Total
                  </TableHead>
                  <TableHead rowSpan={2} className="text-center">
                    Absent
                  </TableHead>
                </TableRow>
                <TableRow>
                  {data.leaveTypes.map((leaveType) => (
                    <Fragment key={leaveType.id}>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Used</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                    </Fragment>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={totalColumnCount} className="py-10 text-center text-muted-foreground">
                      No employees found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.rows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell>
                        <div className="font-medium">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{row.employeeEmail}</div>
                      </TableCell>
                      <TableCell>{row.branchName}</TableCell>

                      {data.leaveTypes.map((leaveType) => {
                        const metric = row.leaveByType[leaveType.id] ?? { total: 0, used: 0, remaining: 0 };
                        return (
                          <Fragment key={`${row.userId}:${leaveType.id}`}>
                            <TableCell className="text-right">{metric.total}</TableCell>
                            <TableCell className="text-right">{metric.used}</TableCell>
                            <TableCell className="text-right">{metric.remaining}</TableCell>
                          </Fragment>
                        );
                      })}

                      <TableCell className="text-right font-medium">{row.totals.total}</TableCell>
                      <TableCell className="text-right font-medium">{row.totals.used}</TableCell>
                      <TableCell className="text-right font-medium">{row.totals.remaining}</TableCell>
                      <TableCell className="text-center font-medium">{row.absent}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}