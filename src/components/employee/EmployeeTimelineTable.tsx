"use client";

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Calendar, Clock, TrendingUp } from "lucide-react";
import { getTimelineStatusDisplay, type TimelineStatus } from "@/lib/timeline-status";

interface TimeRecord {
  id: string;
  date: Date;
  status?: TimelineStatus | null;
  isProcessed: boolean;
  requiredCheckIn: Date | null;
  requiredCheckOut: Date | null;
  requiredBreakTime: string | null;
  actualCheckIn: Date | null;
  actualCheckOut: Date | null;
  actualBreakTime: string | null;
  requiredActiveTime: string | null;
  actualActiveTime: string | null;
  overtimeUndertime: string | null;
}

interface EmployeeTimelineTableProps {
  records: TimeRecord[];
}

export default function EmployeeTimelineTable({ records }: EmployeeTimelineTableProps) {
  const getStatusBadge = (record: TimeRecord) => {
    const display = getTimelineStatusDisplay(record);

    if (!display) {
      return null;
    }

    return (
      <Badge variant={display.variant} className={display.className}>
        {display.label}
      </Badge>
    );
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

  const sortedRecords = [...records].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Date</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Required Schedule</TableHead>
              <TableHead>Actual Times</TableHead>
              <TableHead>Active Time</TableHead>
              <TableHead>Overtime/Undertime</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No timeline records found
                </TableCell>
              </TableRow>
            ) : (
              sortedRecords.map((record) => (
                <TableRow key={record.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div className="font-medium">
                        {format(new Date(record.date), 'MMM dd, yyyy')}
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {format(new Date(record.date), 'EEEE')}
                    </Badge>
                  </TableCell>
                  
                  <TableCell>
                    {getStatusBadge(record)}
                  </TableCell>
                  
                  <TableCell>
                    <div className="text-sm space-y-1">
                      {record.requiredCheckIn ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span>In: {format(new Date(record.requiredCheckIn), 'HH:mm')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span>Out: {record.requiredCheckOut ? format(new Date(record.requiredCheckOut), 'HH:mm') : '--'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-3 w-3 text-muted-foreground" />
                            <span>Break: {record.requiredBreakTime || '--'}</span>
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">Off Day</span>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="text-sm space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>In: {record.actualCheckIn ? format(new Date(record.actualCheckIn), 'HH:mm') : '--'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>Out: {record.actualCheckOut ? format(new Date(record.actualCheckOut), 'HH:mm') : '--'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3 w-3 text-muted-foreground" />
                        <span>Break: {record.actualBreakTime || '--'}</span>
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="text-sm space-y-1">
                      <div>
                        <span className="text-muted-foreground">Required:</span>
                        <span className="ml-1 font-medium">{record.requiredActiveTime || '--'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Actual:</span>
                        <span className="ml-1 font-medium">{record.actualActiveTime || '--'}</span>
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {getOvertimeBadge(record.overtimeUndertime)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary Footer */}
      {records.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="font-medium text-gray-600">Total Records</div>
              <div className="text-2xl font-bold">{records.length}</div>
            </div>
            <div className="text-center">
              <div className="font-medium text-gray-600">Working Days</div>
              <div className="text-2xl font-bold">
                {records.filter(r => r.requiredCheckIn || r.requiredCheckOut).length}
              </div>
            </div>
            <div className="text-center">
              <div className="font-medium text-gray-600">Present Days</div>
              <div className="text-2xl font-bold text-green-600">
                {records.filter(r => r.actualCheckIn).length}
              </div>
            </div>
            <div className="text-center">
              <div className="font-medium text-gray-600">Off Days</div>
              <div className="text-2xl font-bold text-gray-500">
                {records.filter(r => !r.requiredCheckIn && !r.requiredCheckOut).length}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}