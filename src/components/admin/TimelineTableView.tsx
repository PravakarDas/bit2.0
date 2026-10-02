"use client";

import { useMemo, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreVertical,
  RefreshCw,
  Filter,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CalendarX,
  AlertTriangle
} from "lucide-react";
import { updateTimelineRecord, adjustLeaveType, setTimelineRecordProcessed, reverseLatePenalty } from "@/actions/timeline.actions";
import { manualSyncEmployee } from "@/actions/zkteco-sync.actions";
import EmployeeProfileLink from "@/components/admin/EmployeeProfileLink";
import TimelineBulkActions from "@/components/admin/TimelineBulkActions";
import { formatTime12 } from "@/lib/utils";
import { getTimelineStatusDisplay } from "@/lib/timeline-status";
import { formatDurationPill, parseDurationToMinutes } from "@/lib/duration";
import {
  type TimeRecord,
  type BranchOption,
  type EmployeeOption,
  type SortState,
  type ColumnFilters,
  type TimelineSortField,
  type TimelineStatusValue,
  STATUS_OPTIONS
} from "@/components/admin/timeline-types";

interface TimelineTableViewProps {
  records: TimeRecord[];
  loading: boolean;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRecordUpdate: () => void;
  branches: BranchOption[];
  employees: EmployeeOption[];
  sort: SortState;
  onSortChange: (field: TimelineSortField) => void;
  filters: ColumnFilters;
  onFiltersChange: (patch: Partial<ColumnFilters>) => void;
  /** Mirrors SystemControlSettings.zktecoCronEnabled — the "Sync from ZKTeco" action is hidden when off. */
  zktecoSyncEnabled: boolean;
}

const COLUMN_COUNT = 10;

function OtUtPill({ value }: { value: string | null }) {
  const minutes = parseDurationToMinutes(value);
  if (minutes === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const display = formatDurationPill(value);
  const colorClass =
    minutes > 0
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : minutes < 0
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", colorClass)}>
      {minutes > 0 ? "+" : ""}
      {display}
    </span>
  );
}

function otUtTextColor(value: string | null): string {
  const minutes = parseDurationToMinutes(value);
  if (minutes === null || minutes === 0) return "text-muted-foreground";
  return minutes > 0 ? "text-emerald-600" : "text-red-600";
}

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
  leading,
  children
}: {
  label: string;
  className?: string;
  leading?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <TableHead className={className}>
      <div className="flex items-center gap-1">
        {leading}
        <span>{label}</span>
        {children}
      </div>
    </TableHead>
  );
}

function RangeFilterBody({
  label,
  minValue,
  maxValue,
  onApply,
  onClose
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onApply: (min: string, max: string) => void;
  onClose: () => void;
}) {
  const [min, setMin] = useState(minValue);
  const [max, setMax] = useState(maxValue);
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="number" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value)} />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="number" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value)} />
      </div>
      <Button size="sm" className="w-full" onClick={() => { onApply(min, max); onClose(); }}>
        Apply
      </Button>
    </div>
  );
}

function TimeRangeFilterBody({
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
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Time range</Label>
      <div className="flex items-center gap-2">
        <Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="time" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Button size="sm" className="w-full" onClick={() => { onApply(from, to); onClose(); }}>
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
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => { setFrom(""); setTo(""); onApply("", ""); onClose(); }}
        >
          Clear
        </Button>
        <Button size="sm" className="flex-1" onClick={() => { onApply(from, to); onClose(); }}>
          Apply
        </Button>
      </div>
    </div>
  );
}

function CheckboxListFilterBody<T extends string>({
  label,
  options,
  selected,
  onApply,
  onClose,
  searchPlaceholder
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onApply: (values: T[]) => void;
  onClose: () => void;
  /** When provided, shows a search input above the list that narrows the visible options client-side. */
  searchPlaceholder?: string;
}) {
  const [draft, setDraft] = useState<T[]>(selected);
  const [query, setQuery] = useState("");
  const toggle = (value: T) => {
    setDraft((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };
  // Already-applied selections are pinned to the top (ordered once, from `selected`, so rows
  // don't jump while toggling) — easy to find and uncheck without re-searching.
  const orderedOptions = useMemo(
    () => [...options.filter((opt) => selected.includes(opt.value)), ...options.filter((opt) => !selected.includes(opt.value))],
    [options, selected]
  );
  const visibleOptions = query.trim()
    ? orderedOptions.filter((opt) => opt.label.toLowerCase().includes(query.trim().toLowerCase()))
    : orderedOptions;
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {searchPlaceholder !== undefined && (
        <Input
          value={query}
          placeholder={searchPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
        />
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
      {draft.length > 0 && (
        <p className="text-xs text-muted-foreground">{draft.length} selected</p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={selected.length === 0 && draft.length === 0}
          onClick={() => { setDraft([]); onApply([]); onClose(); }}
        >
          Clear
        </Button>
        <Button size="sm" className="flex-1" onClick={() => { onApply(draft); onClose(); }}>
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

export default function TimelineTableView({
  records,
  loading,
  pagination,
  onPageChange,
  onRecordUpdate,
  branches,
  employees,
  sort,
  onSortChange,
  filters,
  onFiltersChange,
  zktecoSyncEnabled
}: TimelineTableViewProps) {
  const [editingRecord, setEditingRecord] = useState<TimeRecord | null>(null);
  // Bulk selection is scoped to the visible page: ids no longer on the page are simply ignored.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectedRecords = records.filter((r) => selectedIds.has(r.id));
  const allOnPageSelected = records.length > 0 && selectedRecords.length === records.length;
  const toggleRecordSelected = (recordId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };
  const togglePageSelected = () => {
    setSelectedIds(allOnPageSelected ? new Set() : new Set(records.map((r) => r.id)));
  };
  const [editForm, setEditForm] = useState({
    status: 'PRESENT' as TimelineStatusValue,
    autoDeductedLeaveType: '',
    requiredCheckIn: '',
    requiredCheckOut: '',
    requiredBreakTime: '',
    actualCheckIn: '',
    actualCheckOut: '',
    actualBreakTime: ''
  });
  const [saving, setSaving] = useState(false);
  const [processedSavingId, setProcessedSavingId] = useState<string | null>(null);
  const [syncingUsers, setSyncingUsers] = useState<Set<string>>(new Set());
  const [reversingPenaltyId, setReversingPenaltyId] = useState<string | null>(null);

  const handleToggleProcessed = async (record: TimeRecord, target: boolean) => {
    if (
      target === false &&
      !window.confirm(
        "Mark this day as UNPROCESSED?\n\nThis clears the actual check-in/out, resets the day to Present with the branch's required times, reverses any wallet penalty applied for this day, and lets the server re-fetch attendance on the next sync.",
      )
    ) {
      return;
    }

    if (
      target === true &&
      !record.actualCheckIn &&
      !record.actualCheckOut &&
      !window.confirm(
        "This day has no attendance data.\n\nMarking it as processed will first check the attendance table; if nothing is found, the day is marked as Weekly Off, deducted from leave balance, or Absent (with a full-day wallet deduction) — the same as the automatic leave processing.",
      )
    ) {
      return;
    }

    setProcessedSavingId(record.id);
    try {
      const result = await setTimelineRecordProcessed(record.id, target);
      if (result.success) {
        onRecordUpdate();
      } else {
        alert(result.error || "Failed to update processing status");
      }
    } catch (error) {
      console.error("Error updating processing status:", error);
      alert("Failed to update processing status");
    } finally {
      setProcessedSavingId(null);
    }
  };

  const handleReverseLatePenalty = async (record: TimeRecord) => {
    if (
      !window.confirm(
        `Reverse the late check-in penalty for ${format(new Date(record.date), 'MMMM d, yyyy')}?\n\nThis credits the previously deducted amount back to the employee's wallet. This can only be done once per day.`,
      )
    ) {
      return;
    }

    setReversingPenaltyId(record.id);
    try {
      const result = await reverseLatePenalty(record.id);
      if (result.success) {
        onRecordUpdate();
      } else {
        alert(result.error || "Failed to reverse late penalty");
      }
    } catch (error) {
      console.error("Error reversing late penalty:", error);
      alert("Failed to reverse late penalty");
    } finally {
      setReversingPenaltyId(null);
    }
  };

  const availableLeaveTypes = (editingRecord?.user.leaveEntitlements || []).filter(
    (entitlement) => entitlement.allocatedDays - entitlement.usedDays > 0,
  );

  const shouldShowManualTimeEditors = ![
    'ABSENT',
    'ON_LEAVE',
    'WEEKLY_OFF',
  ].includes(editForm.status);

  const openEditDialog = (record: TimeRecord) => {
    setEditingRecord(record);
    setEditForm({
      status: record.status || 'PRESENT',
      autoDeductedLeaveType: record.autoDeductedLeaveType || '',
      requiredCheckIn: record.requiredCheckIn ?
        format(new Date(record.requiredCheckIn), 'yyyy-MM-dd\'T\'HH:mm') : '',
      requiredCheckOut: record.requiredCheckOut ?
        format(new Date(record.requiredCheckOut), 'yyyy-MM-dd\'T\'HH:mm') : '',
      requiredBreakTime: record.requiredBreakTime || '',
      actualCheckIn: record.actualCheckIn ?
        format(new Date(record.actualCheckIn), 'yyyy-MM-dd\'T\'HH:mm') : '',
      actualCheckOut: record.actualCheckOut ?
        format(new Date(record.actualCheckOut), 'yyyy-MM-dd\'T\'HH:mm') : '',
      actualBreakTime: record.actualBreakTime || ''
    });
  };

  const handleSave = async () => {
    if (!editingRecord) return;

    setSaving(true);
    try {
      const isCurrentlyOnLeave = editingRecord.status === 'ON_LEAVE';
      const isBeingChangedToOnLeave = editForm.status === 'ON_LEAVE';
      const leaveTypeChanged = editingRecord.autoDeductedLeaveType !== editForm.autoDeductedLeaveType;

      if (isCurrentlyOnLeave && isBeingChangedToOnLeave && leaveTypeChanged && editingRecord.autoDeductedLeaveType && editForm.autoDeductedLeaveType) {
        const adjustResult = await adjustLeaveType(editingRecord.id, editForm.autoDeductedLeaveType);

        if (adjustResult.success) {
          setEditingRecord(null);
          onRecordUpdate();
        } else {
          alert(`Failed to switch leave type: ${adjustResult.error}`);
        }
      } else {
        const result = await updateTimelineRecord(editingRecord.id, {
          status: editForm.status,
          autoDeductedLeaveType: editForm.status === 'ON_LEAVE' ? editForm.autoDeductedLeaveType || null : null,
          requiredCheckIn: (editForm.status === 'ABSENT' || editForm.status === 'ON_LEAVE' || editForm.status === 'WEEKLY_OFF') ? editingRecord.date : (editForm.requiredCheckIn ? new Date(editForm.requiredCheckIn) : null),
          requiredCheckOut: (editForm.status === 'ABSENT' || editForm.status === 'ON_LEAVE' || editForm.status === 'WEEKLY_OFF') ? editingRecord.date : (editForm.requiredCheckOut ? new Date(editForm.requiredCheckOut) : null),
          requiredBreakTime: (editForm.status === 'ABSENT' || editForm.status === 'ON_LEAVE' || editForm.status === 'WEEKLY_OFF') ? '00:00' : (editForm.requiredBreakTime || null),
          actualCheckIn: (editForm.status === 'ABSENT' || editForm.status === 'ON_LEAVE' || editForm.status === 'WEEKLY_OFF') ? editingRecord.date : (editForm.actualCheckIn ? new Date(editForm.actualCheckIn) : null),
          actualCheckOut: (editForm.status === 'ABSENT' || editForm.status === 'ON_LEAVE' || editForm.status === 'WEEKLY_OFF') ? editingRecord.date : (editForm.actualCheckOut ? new Date(editForm.actualCheckOut) : null),
          actualBreakTime: (editForm.status === 'ABSENT' || editForm.status === 'ON_LEAVE' || editForm.status === 'WEEKLY_OFF') ? '00:00' : (editForm.actualBreakTime || null)
        });

        if (result.success) {
          setEditingRecord(null);
          onRecordUpdate();
        } else {
          alert('Failed to update record');
        }
      }
    } catch (error) {
      console.error('Error updating record:', error);
      alert('Error updating record');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (userId: string, date: Date) => {
    setSyncingUsers(prev => new Set(prev).add(userId));
    try {
      const result = await manualSyncEmployee(userId, date);

      if (result.success) {
        if (result.syncedRecords > 0) {
          alert(`✅ Successfully synced ${result.syncedRecords} record(s)!\n\nThe timeline should now show updated check-in/out times.`);
        } else {
          alert(`ℹ️ ${result.message}\n\nNote: Records may already be complete or no new data available.`);
        }
        onRecordUpdate();
        setTimeout(() => onRecordUpdate(), 500);
      } else {
        alert(`❌ Sync failed: ${result.message}${result.errors.length > 0 ? '\n\nErrors:\n' + result.errors.join('\n') : ''}`);
      }
    } catch (error) {
      console.error('Error syncing employee data:', error);
      alert(`❌ Error syncing employee data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSyncingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const getAttendanceStatus = (record: TimeRecord) => {
    const display = getTimelineStatusDisplay(record);
    if (!display) return null;
    return (
      <Badge variant={display.variant} className={display.className}>
        {display.label}
      </Badge>
    );
  };

  const getOpenBreakIndicator = (record: TimeRecord) => {
    if (!record.hasOpenBreak || record.isProcessed) return null;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <AlertTriangle className="h-4 w-4 text-yellow-600" aria-label="Unresolved break punch" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Unresolved break punch — check zkt_attendance data or resolve manually. This day will not auto-process until it clears.
        </TooltipContent>
      </Tooltip>
    );
  };

  if (loading) {
    return (
      <div className="space-y-3 rounded-xl border p-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-6">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="ml-auto h-8 w-16" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TimelineBulkActions
        selectedRecords={selectedRecords}
        onClearSelection={() => setSelectedIds(new Set())}
        onDone={() => {
          setSelectedIds(new Set());
          onRecordUpdate();
        }}
      />
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-gray-50">
            <TableRow className="hover:bg-transparent">
              <ColumnHeaderCell
                label="Employee"
                className="sticky left-0 z-10 min-w-50 bg-gray-50"
                leading={
                  <Checkbox
                    className="mr-1"
                    aria-label="Select all records on this page"
                    disabled={records.length === 0}
                    checked={allOnPageSelected ? true : selectedRecords.length > 0 ? "indeterminate" : false}
                    onCheckedChange={togglePageSelected}
                  />
                }
              >
                <SortButton label="Employee" active={sort.field === "employee"} order={sort.order} onClick={() => onSortChange("employee")} />
                <FilterPopoverButton active={filters.employeeIds.length > 0} label="Employee">
                  {(close) => (
                    <CheckboxListFilterBody
                      label="Employee"
                      searchPlaceholder="Search employees…"
                      options={employees.map((e) => ({ value: e.id, label: e.name }))}
                      selected={filters.employeeIds}
                      onApply={(v) => onFiltersChange({ employeeIds: v })}
                      onClose={close}
                    />
                  )}
                </FilterPopoverButton>
              </ColumnHeaderCell>

              <ColumnHeaderCell label="Branch">
                <SortButton label="Branch" active={sort.field === "branch"} order={sort.order} onClick={() => onSortChange("branch")} />
                <FilterPopoverButton active={filters.branchIds.length > 0} label="Branch">
                  {(close) => (
                    <CheckboxListFilterBody
                      label="Branch"
                      options={branches.map((b) => ({ value: b.id, label: b.name }))}
                      selected={filters.branchIds}
                      onApply={(v) => onFiltersChange({ branchIds: v })}
                      onClose={close}
                    />
                  )}
                </FilterPopoverButton>
              </ColumnHeaderCell>

              <ColumnHeaderCell label="Date">
                <SortButton label="Date" active={sort.field === "date"} order={sort.order} onClick={() => onSortChange("date")} />
                <FilterPopoverButton active={!!(filters.dateFrom || filters.dateTo)} label="Date" contentClassName="w-auto">
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

              <ColumnHeaderCell label="Status">
                <SortButton label="Status" active={sort.field === "status"} order={sort.order} onClick={() => onSortChange("status")} />
                <FilterPopoverButton active={filters.statuses.length > 0} label="Status">
                  {(close) => (
                    <CheckboxListFilterBody
                      label="Status"
                      options={STATUS_OPTIONS}
                      selected={filters.statuses}
                      onApply={(v) => onFiltersChange({ statuses: v })}
                      onClose={close}
                    />
                  )}
                </FilterPopoverButton>
              </ColumnHeaderCell>

              <ColumnHeaderCell label="In">
                <SortButton label="In" active={sort.field === "checkIn"} order={sort.order} onClick={() => onSortChange("checkIn")} />
                <FilterPopoverButton active={!!(filters.checkInFrom || filters.checkInTo)} label="Check-in time">
                  {(close) => (
                    <TimeRangeFilterBody
                      fromValue={filters.checkInFrom}
                      toValue={filters.checkInTo}
                      onApply={(from, to) => onFiltersChange({ checkInFrom: from, checkInTo: to })}
                      onClose={close}
                    />
                  )}
                </FilterPopoverButton>
              </ColumnHeaderCell>

              <ColumnHeaderCell label="Out">
                <SortButton label="Out" active={sort.field === "checkOut"} order={sort.order} onClick={() => onSortChange("checkOut")} />
                <FilterPopoverButton active={!!(filters.checkOutFrom || filters.checkOutTo)} label="Check-out time">
                  {(close) => (
                    <TimeRangeFilterBody
                      fromValue={filters.checkOutFrom}
                      toValue={filters.checkOutTo}
                      onApply={(from, to) => onFiltersChange({ checkOutFrom: from, checkOutTo: to })}
                      onClose={close}
                    />
                  )}
                </FilterPopoverButton>
              </ColumnHeaderCell>

              <ColumnHeaderCell label="Late (min)">
                <SortButton label="Late minutes" active={sort.field === "lateMinutes"} order={sort.order} onClick={() => onSortChange("lateMinutes")} />
                <FilterPopoverButton active={!!(filters.lateMin || filters.lateMax)} label="Late minutes">
                  {(close) => (
                    <RangeFilterBody
                      label="Late minutes"
                      minValue={filters.lateMin}
                      maxValue={filters.lateMax}
                      onApply={(min, max) => onFiltersChange({ lateMin: min, lateMax: max })}
                      onClose={close}
                    />
                  )}
                </FilterPopoverButton>
              </ColumnHeaderCell>

              <ColumnHeaderCell label="Active Time">
                <SortButton label="Active time" active={sort.field === "activeTime"} order={sort.order} onClick={() => onSortChange("activeTime")} />
                <FilterPopoverButton active={!!(filters.activeTimeMin || filters.activeTimeMax)} label="Active time">
                  {(close) => (
                    <RangeFilterBody
                      label="Active time (minutes)"
                      minValue={filters.activeTimeMin}
                      maxValue={filters.activeTimeMax}
                      onApply={(min, max) => onFiltersChange({ activeTimeMin: min, activeTimeMax: max })}
                      onClose={close}
                    />
                  )}
                </FilterPopoverButton>
              </ColumnHeaderCell>

              <ColumnHeaderCell label="OT/UT">
                <SortButton label="OT/UT" active={sort.field === "otUt"} order={sort.order} onClick={() => onSortChange("otUt")} />
                <FilterPopoverButton active={!!(filters.otUtMin || filters.otUtMax)} label="OT/UT">
                  {(close) => (
                    <RangeFilterBody
                      label="OT/UT (minutes)"
                      minValue={filters.otUtMin}
                      maxValue={filters.otUtMax}
                      onApply={(min, max) => onFiltersChange({ otUtMin: min, otUtMax: max })}
                      onClose={close}
                    />
                  )}
                </FilterPopoverButton>
              </ColumnHeaderCell>

              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <CalendarX className="h-8 w-8" />
                    <p className="text-sm font-medium">No attendance records found.</p>
                    <Button variant="outline" size="sm" className="mt-1" onClick={onRecordUpdate}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh Timeline
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <TableRow key={record.id} className="hover:bg-gray-50/80">
                  <TableCell className="sticky left-0 z-10 bg-white group-hover:bg-gray-50/80">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Checkbox
                        aria-label="Select record"
                        checked={selectedIds.has(record.id)}
                        onCheckedChange={() => toggleRecordSelected(record.id)}
                      />
                      <EmployeeProfileLink
                        employeeId={record.user.id}
                        name={record.user.firstName && record.user.lastName
                          ? `${record.user.firstName} ${record.user.lastName}`
                          : undefined}
                        email={record.user.email}
                        className="hover:underline"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {record.user.branch?.name || 'No Branch'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      {format(new Date(record.date), 'MMM dd, yyyy')}
                      <Badge variant="outline" className="text-xs font-normal">
                        {format(new Date(record.date), 'EEE')}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {getAttendanceStatus(record)}
                      {getOpenBreakIndicator(record)}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatTime12(record.actualCheckIn)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatTime12(record.actualCheckOut)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {record.lateCheckInMinutes && record.lateCheckInMinutes > 0 ? (
                      <span className="font-medium text-red-600">{record.lateCheckInMinutes}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="space-y-0.5">
                      <div>Active: <span className="font-medium">{formatDurationPill(record.actualActiveTime)}</span></div>
                      <div className="text-muted-foreground">Req: {formatDurationPill(record.requiredActiveTime)}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <OtUtPill value={record.overtimeUndertime} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Dialog>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openEditDialog(record)}
                                aria-label="View / edit record"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                          </TooltipTrigger>
                          <TooltipContent>View / edit record</TooltipContent>
                        </Tooltip>
                        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Time Record Details</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="text-sm text-muted-foreground">
                              <EmployeeProfileLink
                                employeeId={record.user.id}
                                name={record.user.firstName && record.user.lastName
                                  ? `${record.user.firstName} ${record.user.lastName}`
                                  : undefined}
                                email={record.user.email}
                              /> - {format(new Date(record.date), 'MMM dd, yyyy')}
                            </div>

                            <div className="grid grid-cols-3 gap-3 rounded-md border p-3">
                              <div>
                                <div className="text-xs text-muted-foreground">System OT/UT</div>
                                <div className={cn("text-sm font-medium", otUtTextColor(record.officialOvertimeundertime))}>
                                  {formatDurationPill(record.officialOvertimeundertime)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Requested OT</div>
                                <div className={cn("text-sm font-medium", otUtTextColor(record.requestedOvertime))}>
                                  {formatDurationPill(record.requestedOvertime)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Total OT/UT</div>
                                <div className={cn("text-sm font-medium", otUtTextColor(record.overtimeUndertime))}>
                                  {formatDurationPill(record.overtimeUndertime)}
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-4">
                              <div>
                                <Label htmlFor="status">Status</Label>
                                <Select
                                  value={editForm.status}
                                  onValueChange={(value) => setEditForm({
                                    ...editForm,
                                    status: value as TimelineStatusValue,
                                    autoDeductedLeaveType: value === 'ON_LEAVE' ? editForm.autoDeductedLeaveType : ''
                                  })}
                                >
                                  <SelectTrigger id="status">
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="PRESENT">Present</SelectItem>
                                    <SelectItem value="ABSENT">Absent</SelectItem>
                                    <SelectItem value="ON_LEAVE" disabled={availableLeaveTypes.length === 0}>On Leave</SelectItem>
                                    <SelectItem value="WEEKLY_OFF">Weekly Off</SelectItem>
                                  </SelectContent>
                                </Select>
                                {availableLeaveTypes.length === 0 && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    No leave balance available for this employee.
                                  </p>
                                )}
                              </div>

                              {editingRecord?.status === 'ON_LEAVE' && editForm.status === 'PRESENT' && editingRecord?.autoDeductedLeaveType && (
                                <div className="rounded border border-green-200 bg-green-50 p-3">
                                  <p className="mb-2 text-xs font-semibold text-green-800">✓ Leave Balance Restoration</p>
                                  <p className="text-sm text-green-700">
                                    Transitioning from <strong>ON_LEAVE</strong> to <strong>PRESENT</strong>:
                                  </p>
                                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-green-700">
                                    <li>1 day will be restored to <strong>{editingRecord.autoDeductedLeaveType}</strong></li>
                                    <li>Check-in and/or Check-out times can be set now or added later</li>
                                    <li>All changes will be logged in audit trail</li>
                                  </ul>
                                </div>
                              )}

                              {editForm.status === 'ON_LEAVE' && (
                                <div className="space-y-3 rounded border border-blue-200 bg-blue-50 p-3">
                                  {editingRecord?.status === 'ON_LEAVE' && editingRecord?.autoDeductedLeaveType && (
                                    <div>
                                      <Label className="text-xs font-semibold text-blue-900">Current Leave Type</Label>
                                      <div className="py-2 text-sm font-medium text-blue-800">
                                        {editingRecord.autoDeductedLeaveType}
                                      </div>
                                    </div>
                                  )}
                                  <div>
                                    <Label htmlFor="autoDeductedLeaveType" className="text-sm font-semibold">
                                      {editingRecord?.status === 'ON_LEAVE' ? 'Switch to Leave Type' : 'Select Leave Type'}
                                    </Label>
                                    <Select
                                      value={editForm.autoDeductedLeaveType || undefined}
                                      onValueChange={(value) => setEditForm({
                                        ...editForm,
                                        autoDeductedLeaveType: value
                                      })}
                                    >
                                      <SelectTrigger id="autoDeductedLeaveType">
                                        <SelectValue placeholder="Select leave type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {availableLeaveTypes.map((entitlement) => {
                                          const isCurrentLeaveType = editingRecord?.autoDeductedLeaveType === entitlement.leaveType.name;
                                          const balance = entitlement.allocatedDays - entitlement.usedDays;
                                          return (
                                            <SelectItem
                                              key={entitlement.id}
                                              value={entitlement.leaveType.name}
                                              disabled={isCurrentLeaveType}
                                            >
                                              {entitlement.leaveType.name} ({balance} available)
                                              {isCurrentLeaveType && ' - Current'}
                                            </SelectItem>
                                          );
                                        })}
                                      </SelectContent>
                                    </Select>
                                    {editForm.autoDeductedLeaveType && editingRecord?.autoDeductedLeaveType && editForm.autoDeductedLeaveType !== editingRecord.autoDeductedLeaveType && (
                                      <p className="mt-2 rounded bg-blue-100 p-2 text-xs text-blue-700">
                                        ℹ️ Switching from <strong>{editingRecord.autoDeductedLeaveType}</strong> to <strong>{editForm.autoDeductedLeaveType}</strong>: +1 day restored, -1 day deducted. All changes will be logged.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {shouldShowManualTimeEditors && (
                                <>
                                  <div className="border-b pb-4">
                                    <h4 className="mb-3 text-sm font-medium text-muted-foreground">Required Times</h4>
                                    <div className="grid gap-3">
                                      <div>
                                        <Label htmlFor="requiredCheckIn">Required Check In</Label>
                                        <Input
                                          id="requiredCheckIn"
                                          type="datetime-local"
                                          value={editForm.requiredCheckIn}
                                          onChange={(e) => setEditForm({ ...editForm, requiredCheckIn: e.target.value })}
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="requiredCheckOut">Required Check Out</Label>
                                        <Input
                                          id="requiredCheckOut"
                                          type="datetime-local"
                                          value={editForm.requiredCheckOut}
                                          onChange={(e) => setEditForm({ ...editForm, requiredCheckOut: e.target.value })}
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="requiredBreakTime">Required Break Time (HH:MM)</Label>
                                        <Input
                                          id="requiredBreakTime"
                                          type="text"
                                          placeholder="01:00"
                                          value={editForm.requiredBreakTime}
                                          onChange={(e) => setEditForm({ ...editForm, requiredBreakTime: e.target.value })}
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div>
                                    <h4 className="mb-3 text-sm font-medium text-muted-foreground">Actual Times</h4>
                                    <div className="grid gap-3">
                                      <div>
                                        <Label htmlFor="actualCheckIn">Actual Check In</Label>
                                        <Input
                                          id="actualCheckIn"
                                          type="datetime-local"
                                          value={editForm.actualCheckIn}
                                          onChange={(e) => setEditForm({ ...editForm, actualCheckIn: e.target.value })}
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="actualCheckOut">Actual Check Out</Label>
                                        <Input
                                          id="actualCheckOut"
                                          type="datetime-local"
                                          value={editForm.actualCheckOut}
                                          onChange={(e) => setEditForm({ ...editForm, actualCheckOut: e.target.value })}
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="actualBreakTime">Actual Break Time (HH:MM)</Label>
                                        <Input
                                          id="actualBreakTime"
                                          type="text"
                                          placeholder="01:00"
                                          value={editForm.actualBreakTime}
                                          onChange={(e) => setEditForm({ ...editForm, actualBreakTime: e.target.value })}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="flex justify-end gap-2">
                              <Button onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving...' : 'Save Changes'}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent>More actions</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end">
                          {zktecoSyncEnabled && (
                            <>
                              <DropdownMenuItem
                                disabled={syncingUsers.has(record.user.id)}
                                onSelect={() => handleSync(record.user.id, record.date)}
                              >
                                <RefreshCw className={cn("h-4 w-4", syncingUsers.has(record.user.id) && "animate-spin")} />
                                {syncingUsers.has(record.user.id) ? "Syncing…" : "Sync from ZKTeco"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem
                            disabled={processedSavingId === record.id}
                            onSelect={() => handleToggleProcessed(record, !record.isProcessed)}
                          >
                            {record.isProcessed ? "Mark as Unprocessed & Re-fetch" : "Mark as Processed"}
                          </DropdownMenuItem>
                          {(record.latePenaltyReversible || record.latePenaltyReversed) && (
                            <DropdownMenuItem
                              disabled={!record.latePenaltyReversible || reversingPenaltyId === record.id}
                              onSelect={() => handleReverseLatePenalty(record)}
                            >
                              {record.latePenaltyReversed ? "Late Penalty Reversed" : "Reverse Late Penalty"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(pagination.page - 1)}
            disabled={pagination.page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          {getPageNumbers(pagination.page, pagination.totalPages).map((p, idx) =>
            p === "ellipsis" ? (
              <span key={`ellipsis-${idx}`} className="px-2 text-sm text-muted-foreground">…</span>
            ) : (
              <Button
                key={p}
                variant={p === pagination.page ? "default" : "outline"}
                size="icon-sm"
                onClick={() => onPageChange(p)}
              >
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
