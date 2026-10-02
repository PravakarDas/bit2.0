"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, RotateCcw, X } from "lucide-react";
import TimelineTableView from "@/components/admin/TimelineTableView";
import { getTimelineRecords, getTimelineEmployeeOptions } from "@/actions/timeline.actions";
import { getBranches } from "@/actions/branch.actions";
import { getUsers } from "@/actions/user.actions";
import { toast } from "sonner";
import {
  type TimeRecord,
  type BranchOption,
  type EmployeeOption,
  type SortState,
  type ColumnFilters,
  type TimelineSortField,
  EMPTY_COLUMN_FILTERS
} from "@/components/admin/timeline-types";

interface UserOption {
  id: string;
  branchId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface TimelineEmployeeOption {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  isArchived: boolean;
}

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

function hasActiveFilters(filters: ColumnFilters): boolean {
  return (Object.keys(filters) as (keyof ColumnFilters)[]).some((key) => {
    const value = filters[key];
    return Array.isArray(value) ? value.length > 0 : value !== "";
  });
}

export default function TimelineClient({ zktecoSyncEnabled }: { zktecoSyncEnabled: boolean }) {
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<TimelineEmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [leaveBackfillRunning, setLeaveBackfillRunning] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_COLUMN_FILTERS);
  const [sort, setSort] = useState<SortState>({ field: null, order: "asc" });

  const employees: EmployeeOption[] = useMemo(
    () => employeeOptions.map((user) => ({
      id: user.id,
      name: (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email)
        + (user.isArchived ? " (Archived)" : "")
    })),
    [employeeOptions]
  );

  const loadTimeRecords = useCallback(async () => {
    setLoading(true);
    try {
      // If only one side of the date range is set, treat it as a single-day filter
      // rather than an open-ended range. Raw "YYYY-MM-DD" strings are passed through
      // (not wrapped in `new Date(...)`) so the server parses them as local midnight
      // instead of UTC midnight — see buildDateRangeFilter/parseFilterDate in lib/utils.ts.
      const effectiveDateFrom = filters.dateFrom || filters.dateTo || undefined;
      const effectiveDateTo = filters.dateTo || filters.dateFrom || undefined;

      const result = await getTimelineRecords(
        undefined,
        effectiveDateFrom,
        effectiveDateTo,
        {
          branchIds: filters.branchIds.length > 0 ? filters.branchIds : undefined,
          employeeIds: filters.employeeIds.length > 0 ? filters.employeeIds : undefined,
          statuses: filters.statuses.length > 0 ? filters.statuses : undefined,
          page: pagination.page,
          limit: pagination.limit,
          sortBy: sort.field || undefined,
          sortOrder: sort.order,
          lateMinutesMin: filters.lateMin ? Number(filters.lateMin) : undefined,
          lateMinutesMax: filters.lateMax ? Number(filters.lateMax) : undefined,
          checkInFrom: filters.checkInFrom || undefined,
          checkInTo: filters.checkInTo || undefined,
          checkOutFrom: filters.checkOutFrom || undefined,
          checkOutTo: filters.checkOutTo || undefined,
          activeTimeMin: filters.activeTimeMin ? Number(filters.activeTimeMin) : undefined,
          activeTimeMax: filters.activeTimeMax ? Number(filters.activeTimeMax) : undefined,
          otUtMin: filters.otUtMin ? Number(filters.otUtMin) : undefined,
          otUtMax: filters.otUtMax ? Number(filters.otUtMax) : undefined,
        }
      );

      if (result.success) {
        setTimeRecords((result.records as TimeRecord[]) || []);
        setPagination(prev => {
          const serverPagination = result.pagination;
          return {
            ...prev,
            total: serverPagination?.total || 0,
            totalPages: serverPagination?.totalPages || 0
          };
        });
      }
    } catch (error) {
      console.error('Error loading time records:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit, sort]);

  const loadInitialData = useCallback(async () => {
    try {
      const [branchesResult, usersResult, employeeOptionsResult] = await Promise.all([
        getBranches(),
        getUsers(),
        getTimelineEmployeeOptions()
      ]);

      setBranches(branchesResult || []);
      setUsers(usersResult || []);
      if (employeeOptionsResult.success) {
        setEmployeeOptions(employeeOptionsResult.employees || []);
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    void loadTimeRecords();
  }, [loadTimeRecords]);

  const handleFiltersChange = (patch: Partial<ColumnFilters>) => {
    setFilters(prev => ({ ...prev, ...patch }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleClearAllFilters = () => {
    setFilters(EMPTY_COLUMN_FILTERS);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleSortChange = (field: TimelineSortField) => {
    setSort(prev => {
      if (prev.field !== field) return { field, order: "asc" };
      if (prev.order === "asc") return { field, order: "desc" };
      return { field: null, order: "asc" };
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleLimitChange = (limit: number) => {
    setPagination(prev => ({ ...prev, limit, page: 1 }));
  };

  const handleGenerateTimeline = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/admin/generate-timeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`Successfully generated ${result.recordsCreated} timeline records!`);
        void loadTimeRecords();
      } else {
        toast.error(`Failed to generate timeline: ${result.error}`);
      }
    } catch (error) {
      console.error('Error generating timeline:', error);
      toast.error('Error generating timeline records');
    } finally {
      setGenerating(false);
    }
  };

  const handleLeaveAutomationBackfill = async () => {
    setLeaveBackfillRunning(true);
    try {
      const selectedEmployeeId = filters.employeeIds.length === 1 ? filters.employeeIds[0] : '';
      const employeeQuery = selectedEmployeeId ? `&employeeId=${encodeURIComponent(selectedEmployeeId)}` : '';

      const response = await fetch(`/api/leave-automation${employeeQuery}`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        const processedDates = result?.data?.automation?.data?.processedDates;
        const syncedRecords = result?.data?.sync?.syncedRecords;
        if (typeof processedDates === 'number') {
          toast.success(`Leave automation completed. Synced ${syncedRecords ?? 0} records and processed ${processedDates} dates.`);
        } else {
          toast.success('Leave automation completed.');
        }
        void loadTimeRecords();
      } else {
        toast.error(result.error || 'Failed to process leave automation');
      }
    } catch (error) {
      console.error('Error running leave automation backfill:', error);
      toast.error('Failed to process leave automation');
    } finally {
      setLeaveBackfillRunning(false);
    }
  };

  const filtersActive = hasActiveFilters(filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timeline Management</h1>
          <p className="text-muted-foreground">
            View and manage employee attendance and working hours.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLeaveAutomationBackfill}
            disabled={leaveBackfillRunning}
            className="rounded-full"
          >
            <RotateCcw className={`h-4 w-4 ${leaveBackfillRunning ? 'animate-spin' : ''}`} />
            {leaveBackfillRunning ? 'Processing...' : 'Run Leave Automation'}
          </Button>
          <Button
            size="sm"
            onClick={handleGenerateTimeline}
            disabled={generating}
            className="rounded-full"
          >
            <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : "Generate Today's Timeline"}
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <h2 className="text-lg font-semibold">Employee Timeline</h2>
            <p className="text-sm text-muted-foreground">Showing attendance records</p>
          </div>
          <div className="flex items-center gap-3">
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={handleClearAllFilters} className="text-muted-foreground">
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              Total Records: <span className="font-medium text-foreground">{pagination.total}</span>
            </span>
            <Select value={String(pagination.limit)} onValueChange={(v) => handleLimitChange(Number(v))}>
              <SelectTrigger className="h-8 w-27.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROWS_PER_PAGE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option} per page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <TimelineTableView
            records={timeRecords}
            loading={loading}
            pagination={pagination}
            onPageChange={(page: number) => setPagination(prev => ({ ...prev, page }))}
            onRecordUpdate={loadTimeRecords}
            branches={branches}
            employees={employees}
            sort={sort}
            onSortChange={handleSortChange}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            zktecoSyncEnabled={zktecoSyncEnabled}
          />
        </CardContent>
      </Card>
    </div>
  );
}
