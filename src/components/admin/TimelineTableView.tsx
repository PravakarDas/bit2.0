"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  ChevronLeft, 
  ChevronRight, 
  Edit, 
  Calendar,
  User,
  Building2,
  RefreshCw
} from "lucide-react";
import { updateTimelineRecord } from "@/actions/timeline.actions";
import { manualSyncEmployee } from "@/actions/zkteco-sync.actions";
import EmployeeProfileLink from "@/components/admin/EmployeeProfileLink";

interface TimeRecord {
  id: string;
  date: Date;
  status?: "PRESENT" | "ABSENT" | "ON_LEAVE" | "WEEKLY_OFF";
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
      name: string;
      weeklyOffDays: string[];
      checkInTime: string;
      checkOutTime: string;
    } | null;
  };
}

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
}

export default function TimelineTableView({
  records,
  loading,
  pagination,
  onPageChange,
  onRecordUpdate
}: TimelineTableViewProps) {
  const [editingRecord, setEditingRecord] = useState<TimeRecord | null>(null);
  const [editForm, setEditForm] = useState({
    requiredCheckIn: '',
    requiredCheckOut: '',
    requiredBreakTime: '',
    actualCheckIn: '',
    actualCheckOut: '',
    actualBreakTime: ''
  });
  const [saving, setSaving] = useState(false);
  const [syncingUsers, setSyncingUsers] = useState<Set<string>>(new Set());

  const openEditDialog = (record: TimeRecord) => {
    setEditingRecord(record);
    setEditForm({
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
      const result = await updateTimelineRecord(editingRecord.id, {
        requiredCheckIn: editForm.requiredCheckIn ? new Date(editForm.requiredCheckIn) : null,
        requiredCheckOut: editForm.requiredCheckOut ? new Date(editForm.requiredCheckOut) : null,
        requiredBreakTime: editForm.requiredBreakTime || null,
        actualCheckIn: editForm.actualCheckIn ? new Date(editForm.actualCheckIn) : null,
        actualCheckOut: editForm.actualCheckOut ? new Date(editForm.actualCheckOut) : null,
        actualBreakTime: editForm.actualBreakTime || null
      });

      if (result.success) {
        setEditingRecord(null);
        onRecordUpdate();
      } else {
        alert('Failed to update record');
      }
    } catch (error) {
      console.error('Error updating record:', error);
      alert('Error updating record');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (userId: string) => {
    setSyncingUsers(prev => new Set(prev).add(userId));
    try {
      console.log(`Starting manual sync for user: ${userId}`);
      const result = await manualSyncEmployee(userId);
      
      console.log(`Manual sync completed:`, result);
      
      if (result.success) {
        // Show success message
        if (result.syncedRecords > 0) {
          alert(`✅ Successfully synced ${result.syncedRecords} record(s)!\n\nThe timeline should now show updated check-in/out times.`);
        } else {
          alert(`ℹ️ ${result.message}\n\nNote: Records may already be complete or no new data available.`);
        }
        
        // Force refresh the table data
        console.log('Refreshing table data after sync...');
        onRecordUpdate();
        
        // Force a small delay and refresh again to ensure UI updates
        setTimeout(() => {
          console.log('Secondary refresh after sync...');
          onRecordUpdate();
        }, 500);
      } else {
        alert(`❌ Sync failed: ${result.message}${result.errors.length > 0 ? '\n\nErrors:\n' + result.errors.join('\n') : ''}`);
        if (result.errors.length > 0) {
          console.error('Sync errors:', result.errors);
        }
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

  const getOvertimeBadge = (overtime: string | null) => {
    if (!overtime) return null;
    
    const isPositive = !overtime.startsWith('-');
    return (
      <Badge variant={isPositive ? "default" : "destructive"}>
        {isPositive ? '+' : ''}{overtime}
      </Badge>
    );
  };

  const getAttendanceStatus = (record: TimeRecord) => {
    if (record.status === "PRESENT") {
      return <Badge variant="default">Present</Badge>;
    }

    if (record.status === "ABSENT") {
      return <Badge variant="destructive">Absent</Badge>;
    }

    if (record.status === "ON_LEAVE") {
      return <Badge variant="outline">On Leave</Badge>;
    }

    if (record.status === "WEEKLY_OFF") {
      return <Badge variant="secondary">Weekly Off</Badge>;
    }

    if (!record.requiredCheckIn && !record.requiredCheckOut) {
      return <Badge variant="secondary">Off Day</Badge>;
    }

    if (record.actualCheckIn && record.actualCheckOut) {
      return <Badge variant="default">Present</Badge>;
    }

    if (record.actualCheckIn) {
      return <Badge variant="outline">Checked In</Badge>;
    }

    return <Badge variant="destructive">Absent</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse bg-gray-200 h-16 rounded"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Employee</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Actual</TableHead>
              <TableHead>Active Time</TableHead>
              <TableHead>OT/UT</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No timeline records found
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <TableRow key={record.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">
                          <EmployeeProfileLink
                            employeeId={record.user.id}
                            name={record.user.firstName && record.user.lastName
                              ? `${record.user.firstName} ${record.user.lastName}`
                              : undefined}
                            email={record.user.email}
                          />
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {record.user.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {record.user.branch?.name || 'No Branch'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {format(new Date(record.date), 'MMM dd, yyyy')}
                      <Badge variant="outline" className="text-xs">
                        {format(new Date(record.date), 'EEE')}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getAttendanceStatus(record)}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm space-y-1">
                      {record.requiredCheckIn ? (
                        <>
                          <div>In: {format(new Date(record.requiredCheckIn), 'HH:mm')}</div>
                          <div>Out: {record.requiredCheckOut ? format(new Date(record.requiredCheckOut), 'HH:mm') : '--'}</div>
                          <div>Break: {record.requiredBreakTime || '--'}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm space-y-1">
                      <div>In: {record.actualCheckIn ? format(new Date(record.actualCheckIn), 'HH:mm') : '--'}</div>
                      <div>Out: {record.actualCheckOut ? format(new Date(record.actualCheckOut), 'HH:mm') : '--'}</div>
                      <div>Break: {record.actualBreakTime || '--'}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm space-y-1">
                      <div>Req: {record.requiredActiveTime || '--'}</div>
                      <div>Act: {record.actualActiveTime || '--'}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getOvertimeBadge(record.overtimeUndertime)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSync(record.user.id)}
                        disabled={syncingUsers.has(record.user.id)}
                        title="Sync attendance data from ZKTeco"
                      >
                        <RefreshCw 
                          className={`h-4 w-4 ${syncingUsers.has(record.user.id) ? 'animate-spin' : ''}`} 
                        />
                      </Button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openEditDialog(record)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Edit Time Record</DialogTitle>
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
                          
                          <div className="grid gap-4">
                            {/* Required Times Section */}
                            <div className="border-b pb-4">
                              <h4 className="font-medium text-sm text-muted-foreground mb-3">Required Times</h4>
                              <div className="grid gap-3">
                                <div>
                                  <Label htmlFor="requiredCheckIn">Required Check In</Label>
                                  <Input
                                    id="requiredCheckIn"
                                    type="datetime-local"
                                    value={editForm.requiredCheckIn}
                                    onChange={(e) => setEditForm({
                                      ...editForm,
                                      requiredCheckIn: e.target.value
                                    })}
                                  />
                                </div>
                                
                                <div>
                                  <Label htmlFor="requiredCheckOut">Required Check Out</Label>
                                  <Input
                                    id="requiredCheckOut"
                                    type="datetime-local"
                                    value={editForm.requiredCheckOut}
                                    onChange={(e) => setEditForm({
                                      ...editForm,
                                      requiredCheckOut: e.target.value
                                    })}
                                  />
                                </div>
                                
                                <div>
                                  <Label htmlFor="requiredBreakTime">Required Break Time (HH:MM)</Label>
                                  <Input
                                    id="requiredBreakTime"
                                    type="text"
                                    placeholder="01:00"
                                    value={editForm.requiredBreakTime}
                                    onChange={(e) => setEditForm({
                                      ...editForm,
                                      requiredBreakTime: e.target.value
                                    })}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Actual Times Section */}
                            <div>
                              <h4 className="font-medium text-sm text-muted-foreground mb-3">Actual Times</h4>
                              <div className="grid gap-3">
                                <div>
                                  <Label htmlFor="actualCheckIn">Actual Check In</Label>
                                  <Input
                                    id="actualCheckIn"
                                    type="datetime-local"
                                    value={editForm.actualCheckIn}
                                    onChange={(e) => setEditForm({
                                      ...editForm,
                                      actualCheckIn: e.target.value
                                    })}
                                  />
                                </div>
                                
                                <div>
                                  <Label htmlFor="actualCheckOut">Actual Check Out</Label>
                                  <Input
                                    id="actualCheckOut"
                                    type="datetime-local"
                                    value={editForm.actualCheckOut}
                                    onChange={(e) => setEditForm({
                                      ...editForm,
                                      actualCheckOut: e.target.value
                                    })}
                                  />
                                </div>
                                
                                <div>
                                  <Label htmlFor="actualBreakTime">Actual Break Time (HH:MM)</Label>
                                  <Input
                                    id="actualBreakTime"
                                    type="text"
                                    placeholder="01:00"
                                    value={editForm.actualBreakTime}
                                    onChange={(e) => setEditForm({
                                      ...editForm,
                                      actualBreakTime: e.target.value
                                    })}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex justify-end gap-2">
                            <Button 
                              onClick={handleSave} 
                              disabled={saving}
                            >
                              {saving ? 'Saving...' : 'Save Changes'}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} results
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            
            <span className="px-4 py-2 text-sm">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}