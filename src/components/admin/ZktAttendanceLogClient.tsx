"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X, Loader2 } from "lucide-react";
import ZktAttendanceLogTableView from "@/components/admin/ZktAttendanceLogTableView";
import { getZktAttendanceLogRecords, getZktAttendanceFilterOptions } from "@/actions/zkt-attendance-log.actions";
import {
  type ZktAttendanceLogRecord,
  type ZktAttendanceLogFilters,
  type ZktAttendanceLogSortField,
  EMPTY_ZKT_ATTENDANCE_LOG_FILTERS
} from "@/components/admin/zkt-attendance-log-types";

interface UserOption {
  id: string;
  name: string;
}

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

function hasActiveFilters(filters: ZktAttendanceLogFilters): boolean {
  return (Object.keys(filters) as (keyof ZktAttendanceLogFilters)[]).some((key) => {
    const value = filters[key];
    return Array.isArray(value) ? value.length > 0 : value !== "";
  });
}

export default function ZktAttendanceLogClient() {
  const [records, setRecords] = useState<ZktAttendanceLogRecord[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [branchNames, setBranchNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  // A ref (not state) on purpose: flipping it must not change loadRecords's
  // identity or re-trigger the load effect — it only decides, at call time,
  // whether THIS call should show the full skeleton.
  const hasLoadedOnceRef = useRef(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });

  const [filters, setFilters] = useState<ZktAttendanceLogFilters>(EMPTY_ZKT_ATTENDANCE_LOG_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<{ field: ZktAttendanceLogSortField | null; order: "asc" | "desc" }>({ field: "time", order: "desc" });

  // Search only runs when the user explicitly asks for it (Search button or
  // Enter) — no auto-query-per-keystroke, which was making typing feel slow.
  const runSearch = () => {
    setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const loadRecords = useCallback(async () => {
    // Only the very first load blanks the table with a skeleton — every
    // subsequent search/filter/sort keeps the current rows visible (with a
    // small spinner) so typing in the search box feels instant, not jumpy.
    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }
    setIsFetching(true);
    try {
      const result = await getZktAttendanceLogRecords({
        search: filters.search || undefined,
        userIds: filters.userIds.length > 0 ? filters.userIds : undefined,
        punchCodes: filters.punchCodes.length > 0 ? filters.punchCodes.map(Number) : undefined,
        branchNames: filters.branchNames.length > 0 ? filters.branchNames : undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        page: pagination.page,
        limit: pagination.limit,
        sortBy: sort.field || undefined,
        sortOrder: sort.order,
      });

      if (result.success) {
        setRecords((result.records as ZktAttendanceLogRecord[]) || []);
        setPagination((prev) => ({
          ...prev,
          total: result.pagination?.total || 0,
          totalPages: result.pagination?.totalPages || 0,
        }));
      }
    } catch (error) {
      console.error("Error loading zkt_attendance log:", error);
    } finally {
      setLoading(false);
      setIsFetching(false);
      hasLoadedOnceRef.current = true;
    }
  }, [filters, pagination.page, pagination.limit, sort]);

  const loadInitialData = useCallback(async () => {
    try {
      const result = await getZktAttendanceFilterOptions();
      if (result.success) {
        setUsers(result.users);
        setBranchNames(result.branchNames);
      }
    } catch (error) {
      console.error("Error loading filter options:", error);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const handleFiltersChange = (patch: Partial<ZktAttendanceLogFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleClearAllFilters = () => {
    setFilters(EMPTY_ZKT_ATTENDANCE_LOG_FILTERS);
    setSearchInput("");
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleSortChange = (field: ZktAttendanceLogSortField) => {
    setSort((prev) => {
      if (prev.field !== field) return { field, order: "asc" };
      if (prev.order === "asc") return { field, order: "desc" };
      return { field: null, order: "asc" };
    });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleLimitChange = (limit: number) => {
    setPagination((prev) => ({ ...prev, limit, page: 1 }));
  };

  const filtersActive = useMemo(() => hasActiveFilters(filters), [filters]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Attendance Log</h1>
        <p className="text-muted-foreground">
          Raw punch data from the attendance device sync table (zkt_attendance).
        </p>
      </div>

      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <h2 className="text-lg font-semibold">Device Punch Records</h2>
            <p className="text-sm text-muted-foreground">Showing raw check-in/out and break punches</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                  placeholder="Search by ID or name…"
                  className="h-8 w-64 pl-8 pr-7"
                />
                {isFetching && !loading && (
                  <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              <Button size="sm" className="h-8" onClick={runSearch}>
                Search
              </Button>
            </div>
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
          <ZktAttendanceLogTableView
            records={records}
            loading={loading}
            pagination={pagination}
            onPageChange={(page: number) => setPagination((prev) => ({ ...prev, page }))}
            users={users}
            branchNames={branchNames}
            sort={sort}
            onSortChange={handleSortChange}
            filters={filters}
            onFiltersChange={handleFiltersChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
