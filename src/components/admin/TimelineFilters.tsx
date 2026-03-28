"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, Search, X } from "lucide-react";

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

interface TimelineFiltersProps {
  filters: FilterOptions;
  branches: BranchOption[];
  users: UserOption[];
  onFilterChange: (key: keyof FilterOptions, value: string) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
}

export default function TimelineFilters({
  filters,
  branches,
  users,
  onFilterChange,
  onApplyFilters,
  onClearFilters
}: TimelineFiltersProps) {
  // Filter users based on selected branch
  const filteredUsers = filters.branchId ? 
    users.filter(user => user.branchId === filters.branchId) : 
    users;

  const hasActiveFilters = Object.values(filters).some(value => value !== "");

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
          {hasActiveFilters && (
            <Button 
              onClick={onClearFilters} 
              variant="ghost" 
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Branch Filter */}
          <div className="space-y-2">
            <Label htmlFor="branch-filter">Branch</Label>
            <Select
              value={filters.branchId || "all-branches"}
              onValueChange={(value) => onFilterChange('branchId', value === "all-branches" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-branches">All Branches</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Employee Filter */}
          <div className="space-y-2">
            <Label htmlFor="employee-filter">Employee</Label>
            <Select
              value={filters.userId || "all-employees"}
              onValueChange={(value) => onFilterChange('userId', value === "all-employees" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-employees">All Employees</SelectItem>
                {filteredUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.firstName && user.lastName ? 
                      `${user.firstName} ${user.lastName}` : 
                      user.email
                    }
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Start Date Filter */}
          <div className="space-y-2">
            <Label htmlFor="start-date">Start Date</Label>
            <Input
              id="start-date"
              type="date"
              value={filters.startDate}
              onChange={(e) => onFilterChange('startDate', e.target.value)}
            />
          </div>

          {/* End Date Filter */}
          <div className="space-y-2">
            <Label htmlFor="end-date">End Date</Label>
            <Input
              id="end-date"
              type="date"
              value={filters.endDate}
              onChange={(e) => onFilterChange('endDate', e.target.value)}
              min={filters.startDate} // Ensure end date is not before start date
            />
          </div>

          {/* Name Search */}
          <div className="space-y-2">
            <Label htmlFor="employee-name-search">Search By Name</Label>
            <Input
              id="employee-name-search"
              type="text"
              placeholder="Type employee name"
              value={filters.employeeName}
              onChange={(e) => onFilterChange('employeeName', e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={onApplyFilters} size="sm">
            <Search className="h-4 w-4 mr-2" />
            Search
          </Button>
        </div>

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              
              {filters.branchId && (
                <div className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-sm">
                  Branch: {branches.find(b => b.id === filters.branchId)?.name}
                  <button
                    onClick={() => onFilterChange('branchId', '')}
                    className="ml-1 hover:bg-primary/20 rounded"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              
              {filters.userId && (
                <div className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-sm">
                  Employee: {(() => {
                    const user = users.find(u => u.id === filters.userId);
                    return user?.firstName && user?.lastName ? 
                      `${user.firstName} ${user.lastName}` : 
                      user?.email;
                  })()}
                  <button
                    onClick={() => onFilterChange('userId', '')}
                    className="ml-1 hover:bg-primary/20 rounded"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              
              {filters.startDate && (
                <div className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-sm">
                  From: {filters.startDate}
                  <button
                    onClick={() => onFilterChange('startDate', '')}
                    className="ml-1 hover:bg-primary/20 rounded"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              
              {filters.endDate && (
                <div className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-sm">
                  To: {filters.endDate}
                  <button
                    onClick={() => onFilterChange('endDate', '')}
                    className="ml-1 hover:bg-primary/20 rounded"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {filters.employeeName && (
                <div className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-sm">
                  Name: {filters.employeeName}
                  <button
                    onClick={() => onFilterChange('employeeName', '')}
                    className="ml-1 hover:bg-primary/20 rounded"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}