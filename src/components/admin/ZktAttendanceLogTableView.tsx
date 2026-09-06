"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Filter, ArrowUp, ArrowDown, ArrowUpDown, CalendarX } from "lucide-react";
import {
  type ZktAttendanceLogRecord,
  type ZktAttendanceLogFilters,
  type ZktAttendanceLogSortField,
  PUNCH_TYPE_OPTIONS,
  punchBadgeClass
} from "@/components/admin/zkt-attendance-log-types";

interface UserOption {
  id: string;
  name: string;
}

interface ZktAttendanceLogTableViewProps {
  records: ZktAttendanceLogRecord[];
  loading: boolean;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  users: UserOption[];
  branchNames: string[];
  sort: { field: ZktAttendanceLogSortField | null; order: "asc" | "desc" };
  onSortChange: (field: ZktAttendanceLogSortField) => void;
  filters: ZktAttendanceLogFilters;
  onFiltersChange: (patch: Partial<ZktAttendanceLogFilters>) => void;
}

const COLUMN_COUNT = 4;

function SortButton({
  active,
  order,
  onClick,
  label
}: {
  active: boolean;
  order: "asc" | "desc";
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sort by ${label}`}
      className={cn(
        "rounded p-0.5 transition-colors hover:bg-accent",
        active ? "text-foreground" : "text-muted-foreground/60"
      )}
    >
      {active ? (
        order === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function FilterPopoverButton({
  active,
  label,
  contentClassName,
  children
}: {
  active: boolean;
  label: string;
  contentClassName?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Filter ${label}`}
          className={cn(
            "relative rounded p-0.5 transition-colors hover:bg-accent",
            active ? "text-primary" : "text-muted-foreground/60"
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          {active && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className={contentClassName ?? "w-64"} align="start">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

function ColumnHeaderCell({
  label,
  className,
  children
}: {
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <TableHead className={className}>
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {children}
      </div>
    </TableHead>
  );
}

function CheckboxListFilterBody({
  label,
  options,
  selected,
  onApply,
  onClose,
  searchPlaceholder
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onApply: (values: string[]) => void;
  onClose: () => void;
  searchPlaceholder?: string;
}) {
  const [draft, setDraft] = useState<string[]>(selected);
  const [query, setQuery] = useState("");
  const toggle = (value: string) => {
    setDraft((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };
  const visibleOptions = query.trim()
    ? options.filter((opt) => opt.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {searchPlaceholder !== undefined && (
        <Input value={query} placeholder={searchPlaceholder} onChange={(e) => setQuery(e.target.value)} />
      )}
      <div className="max-h-48 space-y-1.5 overflow-y-auto">
        {visibleOptions.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No matches</p>
        ) : (
          visibleOptions.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={draft.includes(opt.value)} onCheckedChange={() => toggle(opt.value)} />
              {opt.label}
            </label>
          ))
        )}
      </div>
      {draft.length > 0 && <p className="text-xs text-muted-foreground">{draft.length} selected</p>}
      <Button size="sm" className="w-full" onClick={() => { onApply(draft); onClose(); }}>
        Apply
      </Button>
    </div>
  );
}

function parseLocalDateString(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function DateRangeFilterBody({
  fromValue,
  toValue,
  onApply,
  onClose
}: {
  fromValue: string;
  toValue: string;
  onApply: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(fromValue);
  const [to, setTo] = useState(toValue);

  const selectedRange: DateRange | undefined = (from || to)
    ? { from: parseLocalDateString(from), to: parseLocalDateString(to) }
    : undefined;

  const handleCalendarSelect = (range: DateRange | undefined) => {
    setFrom(range?.from ? format(range.from, "yyyy-MM-dd") : "");
    setTo(range?.to ? format(range.to, "yyyy-MM-dd") : "");
  };

  return (
    <div className="space-y-3">
      <Label className="text-xs text-muted-foreground">Date range</Label>
      <Calendar
        mode="range"
        selected={selectedRange}
        onSelect={handleCalendarSelect}
        defaultMonth={selectedRange?.from ?? new Date()}
        numberOfMonths={1}
        className="rounded-md border p-2"
      />
      <div className="flex items-center gap-2">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => { setFrom(""); setTo(""); onApply("", ""); onClose(); }}>
          Clear
        </Button>
        <Button size="sm" className="flex-1" onClick={() => { onApply(from, to); onClose(); }}>
          Apply
        </Button>
      </div>
    </div>
  );
}

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 0) return [];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

export default function ZktAttendanceLogTableView({
  records,
  loading,
  pagination,
  onPageChange,
  users,
  branchNames,
  sort,
  onSortChange,
  filters,
  onFiltersChange
}: ZktAttendanceLogTableViewProps) {
  if (loading) {
    return (
      <div className="space-y-3 rounded-xl border p-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-6">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-gray-50">
            <TableRow className="hover:bg-transparent">
              <ColumnHeaderCell label="Time" className="sticky left-0 z-10 min-w-45 bg-gray-50">
                <SortButton label="Time" active={sort.field === "time"} order={sort.order} onClick={() => onSortChange("time")} />
                <FilterPopoverButton active={!!(filters.dateFrom || filters.dateTo)} label="Time" contentClassName="w-auto">
                  {(close) => (
                    <DateRangeFilterBody
                      fromValue={filters.dateFrom}
                      toValue={filters.dateTo}
                      onApply={(from, to) => onFiltersChange({ dateFrom: from, dateTo: to })}
                      onClose={close}
                    />
                  )}
                </FilterPopoverButton>
              </ColumnHeaderCell>

              <ColumnHeaderCell label="Employee" className="min-w-50">
                <SortButton label="Employee" active={sort.field === "employee"} order={sort.order} onClick={() => onSortChange("employee")} />
                <FilterPopoverButton active={filters.userIds.length > 0} label="Employee">
                  {(close) => (
                    <CheckboxListFilterBody
                      label="Employee"
                      searchPlaceholder="Search…"
                      options={users.map((u) => ({ value: u.id, label: u.name }))}
                      selected={filters.userIds}
                      onApply={(v) => onFiltersChange({ userIds: v })}
                      onClose={close}
                    />
                  )}
                </FilterPopoverButton>
              </ColumnHeaderCell>

              <ColumnHeaderCell label="Punch">
                <SortButton label="Punch" active={sort.field === "punch"} order={sort.order} onClick={() => onSortChange("punch")} />
                <FilterPopoverButton active={filters.punchCodes.length > 0} label="Punch">
                  {(close) => (
                    <CheckboxListFilterBody
                      label="Punch"
                      options={PUNCH_TYPE_OPTIONS}
                      selected={filters.punchCodes}
                      onApply={(v) => onFiltersChange({ punchCodes: v })}
                      onClose={close}
                    />
                  )}
                </FilterPopoverButton>
              </ColumnHeaderCell>

              <ColumnHeaderCell label="Branch">
                <SortButton label="Branch" active={sort.field === "branch"} order={sort.order} onClick={() => onSortChange("branch")} />
                <FilterPopoverButton active={filters.branchNames.length > 0} label="Branch">
                  {(close) => (
                    <CheckboxListFilterBody
                      label="Branch"
                      options={branchNames.map((b) => ({ value: b, label: b }))}
                      selected={filters.branchNames}
                      onApply={(v) => onFiltersChange({ branchNames: v })}
                      onClose={close}
                    />
                  )}
                </FilterPopoverButton>
              </ColumnHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <CalendarX className="h-8 w-8" />
                    <p className="text-sm font-medium">No attendance log entries found.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <TableRow key={record.id} className="hover:bg-gray-50/80">
                  <TableCell className="sticky left-0 z-10 bg-white text-sm group-hover:bg-gray-50/80">
                    {format(new Date(record.attendanceTime), "MMM dd, yyyy h:mm:ss a")}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{record.userName || "—"}</div>
                    <div className="text-xs text-muted-foreground">ID {record.userId}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("font-medium", punchBadgeClass(record.punch))}>
                      {record.punchType || "Unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{record.branchName || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="text-sm text-muted-foreground">
          Showing {pagination.total === 0 ? 0 : ((pagination.page - 1) * pagination.limit) + 1} to{' '}
          {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
          {pagination.total} records
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => onPageChange(pagination.page - 1)} disabled={pagination.page === 1}>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          {getPageNumbers(pagination.page, pagination.totalPages).map((p, idx) =>
            p === "ellipsis" ? (
              <span key={`ellipsis-${idx}`} className="px-2 text-sm text-muted-foreground">…</span>
            ) : (
              <Button key={p} variant={p === pagination.page ? "default" : "outline"} size="icon-sm" onClick={() => onPageChange(p)}>
                {p}
              </Button>
            )
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(pagination.page + 1)}
            disabled={pagination.page === pagination.totalPages || pagination.totalPages === 0}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
