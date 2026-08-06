"use client";

import { useState } from "react";
import { format } from "date-fns";
import { cn, formatTime12 } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Eye, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import {
  getTimelineStatusDisplay,
  type TimelineStatus,
} from "@/lib/timeline-status";
import type { TimelineSortField } from "@/actions/timeline.actions";
import type { EmployeeSortState } from "./EmployeeTimelineClient";

function SortButton({
  active,
  order,
  onClick,
  label,
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

function ColumnHeaderCell({
  label,
  className,
  children,
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
  officialOvertimeundertime: string | null;
  requestedOvertime: string | null;
  requestedOTstart?: Date | null;
  requestedOTend?: Date | null;
  lateCheckInMinutes?: number | null;
  lateCheckInPenalty?: number | null;
}

interface EmployeeTimelineTableProps {
  records: TimeRecord[];
  summary: any | null;
  latestProcessedDate: Date | null;
  sort: EmployeeSortState;
  onSortChange: (field: TimelineSortField) => void;
}

export default function EmployeeTimelineTable({
  records,
  summary,
  latestProcessedDate,
  sort,
  onSortChange,
}: EmployeeTimelineTableProps) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<TimeRecord | null>(null);

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

  const getOvertimeColor = (overtime: string | null): string => {
    if (!overtime || overtime === "00:00") {
      return "text-gray-600 bg-gray-50";
    }

    const isPositive = !overtime.startsWith("-");
    return isPositive
      ? "text-green-600 bg-green-50"
      : "text-red-600 bg-red-50";
  };

  const timeStringToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    const isNegative = timeStr.startsWith("-");
    const cleanTime = timeStr.replace("-", "").replace("+", "");
    const [hours, minutes] = cleanTime.split(":").map(Number);
    const totalMinutes = (hours || 0) * 60 + (minutes || 0);
    return isNegative ? -totalMinutes : totalMinutes;
  };

  const getProgressColor = (record: TimeRecord): string => {
    if (!record.isProcessed) return "bg-gray-200";

    switch (record.status) {
      case "PRESENT":
        return "bg-green-500";
      case "ABSENT":
        return "bg-red-500";
      case "ON_LEAVE":
        return "bg-orange-500";
      case "WEEKLY_OFF":
        return "bg-gray-400";
      default:
        return "bg-gray-300";
    }
  };

  const getProgressPercentage = (record: TimeRecord): number => {
    if (!record.isProcessed || !record.requiredActiveTime || !record.actualActiveTime) {
      return 0;
    }

    const required = timeStringToMinutes(record.requiredActiveTime);
    const actual = timeStringToMinutes(record.actualActiveTime);

    if (required === 0) return 100;
    return Math.min(100, (actual / required) * 100);
  };

  const getLatePercentage = (record: TimeRecord): number => {
    if (!record.lateCheckInMinutes || record.lateCheckInMinutes <= 0) {
      return 0;
    }

    if (!record.requiredActiveTime) return 0;
    const required = timeStringToMinutes(record.requiredActiveTime);

    if (required === 0) return 0;
    return Math.min(100, (record.lateCheckInMinutes / required) * 100);
  };

  const calculateLateCheckIn = (record: TimeRecord): number => {
    if (!record.requiredCheckIn || !record.actualCheckIn) {
      return 0;
    }

    const requiredTime = new Date(record.requiredCheckIn).getTime();
    const actualTime = new Date(record.actualCheckIn).getTime();
    const diffMinutes = Math.floor((actualTime - requiredTime) / (1000 * 60));

    // Only show positive values (if late)
    return diffMinutes > 0 ? diffMinutes : 0;
  };

  const formatLateCheckIn = (record: TimeRecord): string => {
    const lateMinutes = calculateLateCheckIn(record);

    if (lateMinutes === 0) {
      return "—";
    }

    if (lateMinutes < 60) {
      return `${lateMinutes}m`;
    }

    const hours = Math.floor(lateMinutes / 60);
    const minutes = lateMinutes % 60;
    return `${hours}h:${minutes.toString().padStart(2, "0")}m`;
  };

  const formatTimeWithLabels = (timeStr: string | null): string => {
    if (!timeStr) return "—";

    const isNegative = timeStr.startsWith("-");
    const cleanTime = timeStr.replace("-", "").replace("+", "");
    const [hours, minutes] = cleanTime.split(":").map(Number);

    const sign = isNegative ? "-" : "";
    return `${sign}${hours || 0}h:${(minutes || 0).toString().padStart(2, "0")}m`;
  };

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto w-full">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="bg-gray-50 border-b border-gray-200">
                <ColumnHeaderCell label="Date" className="w-28 px-2 py-2">
                  <SortButton label="Date" active={sort.field === "date"} order={sort.order} onClick={() => onSortChange("date")} />
                </ColumnHeaderCell>

                <ColumnHeaderCell label="Status" className="w-20 px-2 py-2">
                  <SortButton label="Status" active={sort.field === "status"} order={sort.order} onClick={() => onSortChange("status")} />
                </ColumnHeaderCell>

                <ColumnHeaderCell label="In" className="w-20 px-2 py-2">
                  <SortButton label="In" active={sort.field === "checkIn"} order={sort.order} onClick={() => onSortChange("checkIn")} />
                </ColumnHeaderCell>

                <ColumnHeaderCell label="Out" className="w-20 px-2 py-2">
                  <SortButton label="Out" active={sort.field === "checkOut"} order={sort.order} onClick={() => onSortChange("checkOut")} />
                </ColumnHeaderCell>

                <ColumnHeaderCell label="Late (min)" className="w-20 px-2 py-2">
                  <SortButton label="Late minutes" active={sort.field === "lateMinutes"} order={sort.order} onClick={() => onSortChange("lateMinutes")} />
                </ColumnHeaderCell>

                <ColumnHeaderCell label="Active Time" className="w-32 px-2 py-2">
                  <SortButton label="Active time" active={sort.field === "activeTime"} order={sort.order} onClick={() => onSortChange("activeTime")} />
                </ColumnHeaderCell>

                <ColumnHeaderCell label="OT/UT" className="w-20 px-2 py-2">
                  <SortButton label="OT/UT" active={sort.field === "officialOtUt"} order={sort.order} onClick={() => onSortChange("officialOtUt")} />
                </ColumnHeaderCell>

                <TableHead className="w-12 px-2 py-2 text-center">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-gray-500"
                  >
                    No timeline records found
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow
                    key={record.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors h-16"
                  >
                    {/* Date */}
                    <TableCell className="px-2 py-3">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 text-sm">
                            {format(new Date(record.date), "MMM dd, yyyy")}
                          </div>
                          <div className="text-xs text-gray-500">
                            {format(new Date(record.date), "EEEE")}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="px-2 py-3">{getStatusBadge(record)}</TableCell>

                    {/* In Time */}
                    <TableCell className="px-2 py-3 text-sm">
                      {record.actualCheckIn ? (
                        <div className="text-gray-900 font-medium">
                          {formatTime12(record.actualCheckIn)}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>

                    {/* Out Time */}
                    <TableCell className="px-2 py-3 text-sm">
                      {record.actualCheckOut ? (
                        <div className="text-gray-900 font-medium">
                          {formatTime12(record.actualCheckOut)}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>

                    {/* Late Check-in (Calculated) */}
                    <TableCell className="px-2 py-3 text-sm">
                      {calculateLateCheckIn(record) > 0 ? (
                        <span className="text-red-600 font-medium">
                          {formatLateCheckIn(record)}
                        </span>
                      ) : (
                        <span className="text-green-600 font-medium">—</span>
                      )}
                    </TableCell>

                    {/* Active Time Only */}
                    <TableCell className="px-2 py-3">
                      <div className="text-xs space-y-0">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-600">Active:</span>
                          <span className="text-gray-900 font-medium">
                            {formatTimeWithLabels(record.actualActiveTime)}
                          </span>
                        </div>
                        {record.requiredActiveTime && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">Req:</span>
                            <span className="text-gray-700">
                              {formatTimeWithLabels(record.requiredActiveTime)}
                            </span>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* OT/UT */}
                    <TableCell className="px-2 py-3">
                      {record.officialOvertimeundertime ? (
                        <div
                          className={`text-sm font-medium px-1.5 py-0.5 rounded inline-block whitespace-nowrap ${getOvertimeColor(
                            record.officialOvertimeundertime
                          )}`}
                        >
                          {formatTimeWithLabels(record.officialOvertimeundertime)}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </TableCell>

                    {/* Details Button - Eye Icon */}
                    <TableCell className="px-2 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 mx-auto"
                        onClick={() => setSelectedRecord(record)}
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Details Modal */}
      <Dialog open={!!selectedRecord} onOpenChange={() => setSelectedRecord(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedRecord &&
                format(new Date(selectedRecord.date), "MMMM dd, yyyy")}
            </DialogTitle>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-6">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-gray-600 font-medium">Status:</span>
                {getStatusBadge(selectedRecord)}
              </div>

              {/* Schedule vs Actual */}
              <div className="grid grid-cols-2 gap-6">
                {/* Schedule (Required) */}
                <div className="space-y-3 border-r pr-6">
                  <h3 className="font-semibold text-gray-900">Schedule</h3>
                  {selectedRecord.requiredCheckIn ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Check In:</span>
                        <span className="font-medium">
                          {formatTime12(selectedRecord.requiredCheckIn)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Check Out:</span>
                        <span className="font-medium">
                          {formatTime12(selectedRecord.requiredCheckOut)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Break:</span>
                        <span className="font-medium">
                          {selectedRecord.requiredBreakTime || "—"}
                        </span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="text-gray-600">Active Time:</span>
                        <span className="font-medium">
                          {selectedRecord.requiredActiveTime || "—"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">Off Day</p>
                  )}
                </div>

                {/* Actual Work Time */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900">Work Time</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Check In:</span>
                      <span className="font-medium">
                        {selectedRecord.actualCheckIn
                          ? formatTime12(selectedRecord.actualCheckIn)
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Check Out:</span>
                      <span className="font-medium">
                        {selectedRecord.actualCheckOut
                          ? formatTime12(selectedRecord.actualCheckOut)
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Break:</span>
                      <span className="font-medium">
                        {selectedRecord.actualBreakTime || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-gray-600">Active Time:</span>
                      <span className="font-medium">
                        {selectedRecord.actualActiveTime || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Overtime/Undertime and Additional Details */}
              <div className="space-y-4 border-t pt-4">
                {/* Official OT/UT */}
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-gray-600 font-medium block text-sm">
                        Official Overtime/Undertime
                      </span>
                      <span className="text-xs text-gray-500">
                        (Office + Work from Home)
                      </span>
                    </div>
                    <div
                      className={`text-xl font-semibold px-3 py-1 rounded ${getOvertimeColor(
                        selectedRecord.officialOvertimeundertime
                      )}`}
                    >
                      {selectedRecord.officialOvertimeundertime
                        ? selectedRecord.officialOvertimeundertime.startsWith("-")
                          ? "-"
                          : "+"
                        : ""}
                      {formatTimeWithLabels(selectedRecord.officialOvertimeundertime) || "—"}
                    </div>
                  </div>
                </div>

                {/* Requested Overtime */}
                {selectedRecord.requestedOvertime && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="font-semibold text-gray-900 mb-3 text-sm">
                      Requested Overtime Details
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Requested Amount:</span>
                        <span className="font-medium">
                          {selectedRecord.requestedOvertime
                            ? selectedRecord.requestedOvertime.startsWith("-")
                              ? "-"
                              : "+"
                            : ""}
                          {formatTimeWithLabels(selectedRecord.requestedOvertime)}
                        </span>
                      </div>
                      {selectedRecord.requestedOTstart && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">From:</span>
                          <span className="font-medium">
                            {formatTime12(
                              new Date(selectedRecord.requestedOTstart)
                            )}
                          </span>
                        </div>
                      )}
                      {selectedRecord.requestedOTend && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">To:</span>
                          <span className="font-medium">
                            {formatTime12(new Date(selectedRecord.requestedOTend))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Late Check-in Information */}
                {selectedRecord.lateCheckInMinutes && selectedRecord.lateCheckInMinutes > 0 && (
                  <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                    <h4 className="font-semibold text-gray-900 mb-3 text-sm">
                      Late Check-in Information
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Late By:</span>
                        <span className="font-medium text-orange-600">
                          {selectedRecord.lateCheckInMinutes} minutes
                        </span>
                      </div>
                      {selectedRecord.lateCheckInPenalty && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Penalty:</span>
                          <span className="font-medium">
                            {selectedRecord.lateCheckInPenalty}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Requested Time/Overtime */}
                {selectedRecord.requestedOvertime && selectedRecord.requestedOTstart && selectedRecord.requestedOTend ? (
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <h4 className="font-semibold text-gray-900 mb-3 text-sm">
                      Requested Time Details
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Requested Amount:</span>
                        <span className="font-medium text-purple-600">
                          {selectedRecord.requestedOvertime.startsWith("-")
                            ? ""
                            : "+"}
                          {selectedRecord.requestedOvertime}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Start Time:</span>
                        <span className="font-medium">
                          {formatTime12(new Date(selectedRecord.requestedOTstart))}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">End Time:</span>
                        <span className="font-medium">
                          {formatTime12(new Date(selectedRecord.requestedOTend))}
                        </span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="text-gray-600">Duration:</span>
                        <span className="font-medium">
                          {Math.round(
                            (new Date(selectedRecord.requestedOTend).getTime() -
                              new Date(selectedRecord.requestedOTstart).getTime()) /
                              (1000 * 60)
                          )}{" "}
                          minutes
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-3 text-sm">
                      Requested Time
                    </h4>
                    <p className="text-sm text-gray-500">
                      No requested overtime for this day
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}