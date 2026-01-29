"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, Users, Filter, Download, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import TimelineTableView from "@/components/admin/TimelineTableView";
import TimelineCalendarView from "@/components/admin/TimelineCalendarView";
import TimelineFilters from "@/components/admin/TimelineFilters";
import { getTimeRecords, initializeTimeRecords } from "@/actions/timeline.actions";
import { getBranches } from "@/actions/branch.actions";
import { getUsers } from "@/actions/user.actions";

interface TimeRecord {
  id: string;
  date: Date;
  requiredCheckIn: Date | null;
  requiredCheckOut: Date | null;
  requiredBreakTime: string | null;
  actualCheckIn: Date | null;
  actualCheckOut: Date | null;
  actualBreakTime: string | null;
  requiredActiveTime: string | null;
  actualActiveTime: string | null;
  overtimeUndertime: string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    branch: {
      id: string;
      name: string;
    } | null;
  };
}

interface FilterOptions {
  branchId: string;
  userId: string;
  startDate: string;
  endDate: string;
}

export default function TimelineClient() {
  const [activeView, setActiveView] = useState<"table" | "calendar">("table");
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  
  const [filters, setFilters] = useState<FilterOptions>({
    branchId: "",
    userId: "",
    startDate: "",
    endDate: ""
  });

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  // Load time records when filters change
  useEffect(() => {
    loadTimeRecords();
  }, [filters, pagination.page]);

  const loadInitialData = async () => {
    try {
      const [branchesResult, usersResult] = await Promise.all([
        getBranches(),
        getUsers()
      ]);
      
      setBranches(branchesResult || []);
      setUsers(usersResult || []);
      
      loadTimeRecords();
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  const loadTimeRecords = async () => {
    setLoading(true);
    try {
      const result = await getTimeRecords({
        branchId: filters.branchId || undefined,
        userId: filters.userId || undefined,
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
        page: pagination.page,
        limit: pagination.limit
      });

      if (result.success) {
        setTimeRecords(result.records || []);
        setPagination(prev => ({
          ...prev,
          total: result.pagination?.total || 0,
          totalPages: result.pagination?.totalPages || 0
        }));
      }
    } catch (error) {
      console.error('Error loading time records:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInitializeRecords = async () => {
    setInitializing(true);
    try {
      const result = await initializeTimeRecords();
      if (result.success) {
        alert(`Successfully created ${result.recordsCreated} time records`);
        loadTimeRecords();
      } else {
        alert('Failed to initialize time records');
      }
    } catch (error) {
      console.error('Error initializing records:', error);
      alert('Error initializing time records');
    } finally {
      setInitializing(false);
    }
  };

  const handleFilterChange = (key: keyof FilterOptions, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setPagination(prev => ({
      ...prev,
      page: 1 // Reset to first page when filters change
    }));
  };

  const clearFilters = () => {
    setFilters({
      branchId: "",
      userId: "",
      startDate: "",
      endDate: ""
    });
    setPagination(prev => ({
      ...prev,
      page: 1
    }));
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
            onClick={handleInitializeRecords} 
            disabled={initializing}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${initializing ? 'animate-spin' : ''}`} />
            {initializing ? 'Initializing...' : 'Initialize Records'}
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
              onRecordUpdate={loadTimeRecords}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}