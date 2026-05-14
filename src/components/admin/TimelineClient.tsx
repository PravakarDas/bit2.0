"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, Users, Download, RefreshCw, RotateCcw } from "lucide-react";
import TimelineTableView from "@/components/admin/TimelineTableView";
import TimelineCalendarView from "@/components/admin/TimelineCalendarView";
import TimelineFilters from "@/components/admin/TimelineFilters";
import { getTimelineRecords } from "@/actions/timeline.actions";
import { getBranches } from "@/actions/branch.actions";
import { getUsers } from "@/actions/user.actions";
import { toast } from "sonner";

interface TimeRecord {
  id: string;
  date: Date;
  isProcessed: boolean;
  status: "PRESENT" | "ABSENT" | "ON_LEAVE" | "WEEKLY_OFF";
  requiredCheckIn: Date | null;
  requiredCheckOut: Date | null;
  requiredBreakTime: string | null;
  actualCheckIn: Date | null;
  actualCheckOut: Date | null;
  actualBreakTime: string | null;
  requiredActiveTime: string | null;
  actualActiveTime: string | null;
  overtimeUndertime: string | null;
  autoDeductedLeaveType: string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    leaveEntitlements?: Array<{
      id: string;
      allocatedDays: number;
      usedDays: number;
      leaveType: {
        id: string;
        name: string;
      };
    }>;
    branch: {
      name: string;
      weeklyOffDays: string[];
      checkInTime: string;
      checkOutTime: string;
    } | null;
  };
}

interface FilterOptions {
  branchId: string;
  userId: string;
  startDate: string;
  endDate: string;
  employeeName: string;
}

interface BranchOption {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  branchId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

export default function TimelineClient() {
  const [activeView, setActiveView] = useState<"table" | "calendar">("table");
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [leaveBackfillRunning, setLeaveBackfillRunning] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 60,
    total: 0,
    totalPages: 0
  });

  const [filters, setFilters] = useState<FilterOptions>({
    branchId: "",
    userId: "",
    startDate: "",
    endDate: "",
    employeeName: ""
  });

  const [appliedFilters, setAppliedFilters] = useState<FilterOptions>({
    branchId: "",
    userId: "",
    startDate: "",
    endDate: "",
    employeeName: ""
  });

  const loadTimeRecords = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTimelineRecords(
        appliedFilters.userId || undefined,
        appliedFilters.startDate ? new Date(appliedFilters.startDate) : undefined,
        appliedFilters.endDate ? new Date(appliedFilters.endDate) : undefined,
        {
          branchId: appliedFilters.branchId || undefined,
          employeeName: appliedFilters.employeeName || undefined,
          page: pagination.page,
          limit: pagination.limit
        }
      );

      if (result.success) {
        setTimeRecords(result.records || []);
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
  }, [
    appliedFilters.branchId,
    appliedFilters.employeeName,
    appliedFilters.endDate,
    appliedFilters.startDate,
    appliedFilters.userId,
    pagination.limit,
    pagination.page,
  ]);

  const loadInitialData = useCallback(async () => {
    try {
      const [branchesResult, usersResult] = await Promise.all([
        getBranches(),
        getUsers()
      ]);
      
      setBranches(branchesResult || []);
      setUsers(usersResult || []);
      
      await loadTimeRecords();
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  }, [loadTimeRecords]);

  // Load initial data
  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Load time records when filters change
  useEffect(() => {
    void loadTimeRecords();
  }, [loadTimeRecords]);

  const clearFilters = () => {
    const clearedFilters = {
      branchId: "",
      userId: "",
      startDate: "",
      endDate: "",
      employeeName: ""
    };
    setFilters(clearedFilters);
    setAppliedFilters(clearedFilters);
    setPagination(prev => ({
      ...prev,
      page: 1
    }));
  };

  const handleFilterChange = (key: keyof FilterOptions, value: string) => {
    if (key === "branchId") {
      const normalizedValue = value === "all-branches" ? "" : value;
      setFilters(prev => {
        const nextFilters = {
          ...prev,
          branchId: normalizedValue,
          userId: normalizedValue && prev.userId
            ? (users.find(user => user.id === prev.userId && user.branchId === normalizedValue) ? prev.userId : "")
            : prev.userId
        };
        setAppliedFilters(nextFilters);
        return nextFilters;
      });
      setPagination(prev => ({
        ...prev,
        page: 1
      }));
      return;
    }

    if (key === "userId") {
      const normalizedValue = value === "all-employees" ? "" : value;
      setFilters(prev => {
        const nextFilters = {
          ...prev,
          userId: normalizedValue
        };
        setAppliedFilters(nextFilters);
        return nextFilters;
      });
      setPagination(prev => ({
        ...prev,
        page: 1
      }));
      return;
    }

    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const applyFilters = () => {
    setAppliedFilters(filters);
    setPagination(prev => ({
      ...prev,
      page: 1
    }));
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
        alert(`Successfully generated ${result.recordsCreated} timeline records!`);
        void loadTimeRecords(); // Refresh the data
      } else {
        alert(`Failed to generate timeline: ${result.error}`);
      }
    } catch (error) {
      console.error('Error generating timeline:', error);
      alert('Error generating timeline records');
    } finally {
      setGenerating(false);
    }
  };

  const handleLeaveAutomationBackfill = async () => {
    setLeaveBackfillRunning(true);
    try {
      const selectedEmployeeId = filters.userId || (() => {
        const query = filters.employeeName.trim().toLowerCase();
        if (!query) return '';

        const matchingUsers = users.filter((user) => {
          const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim().toLowerCase();
          const email = user.email.toLowerCase();
          return fullName.includes(query) || email.includes(query);
        });

        return matchingUsers.length === 1 ? matchingUsers[0].id : '';
      })();

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
  // Calculate summary stats
  const summaryStats = {
    totalEmployees: new Set(timeRecords.map(r => r.user.id)).size,
    totalRecords: pagination.total,
    presentToday: timeRecords.filter(r => {
      const today = new Date();
      const recordDate = new Date(r.date);
      return recordDate.toDateString() === today.toDateString() && r.actualCheckIn;
    }).length,
    avgAttendance: timeRecords.length > 0 ? 
      (timeRecords.filter(r => r.actualCheckIn).length / timeRecords.length * 100).toFixed(1) : '0'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Timeline Management</h1>
          <p className="text-muted-foreground">
            Track and manage employee attendance and working hours
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleLeaveAutomationBackfill}
            disabled={leaveBackfillRunning}
          >
            <RotateCcw className={`h-4 w-4 mr-2 ${leaveBackfillRunning ? 'animate-spin' : ''}`} />
            {leaveBackfillRunning ? 'Processing...' : 'Run Leave Automation'}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleGenerateTimeline}
            disabled={generating}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Generate Today\'s Timeline'}
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.totalEmployees}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.totalRecords}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Present Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.presentToday}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Attendance</CardTitle>
            <Badge variant="secondary">{summaryStats.avgAttendance}%</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">Current Period</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <TimelineFilters
        filters={filters}
        branches={branches}
        users={users}
        onFilterChange={handleFilterChange}
        onApplyFilters={applyFilters}
        onClearFilters={clearFilters}
      />

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Employee Timeline</CardTitle>
              <CardDescription>
                View and manage employee attendance records
              </CardDescription>
            </div>
            <Tabs value={activeView} onValueChange={(value) => setActiveView(value as "table" | "calendar")}>
              <TabsList>
                <TabsTrigger value="table">Table View</TabsTrigger>
                <TabsTrigger value="calendar">Calendar View</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {activeView === "table" ? (
            <TimelineTableView
              records={timeRecords}
              loading={loading}
              pagination={pagination}
              onPageChange={(page: number) => setPagination(prev => ({ ...prev, page }))}
              onRecordUpdate={loadTimeRecords}
            />
          ) : (
            <TimelineCalendarView
              records={timeRecords}
              loading={loading}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}