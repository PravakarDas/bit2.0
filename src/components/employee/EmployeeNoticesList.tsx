"use client";

import { AlertTriangle, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Notice {
  id: string;
  title: string;
  isEdited: boolean;
  createdAt: Date | string;
}

interface EmployeeNoticesListProps {
  notices: Notice[];
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EmployeeNoticesList({ notices }: EmployeeNoticesListProps) {
  if (notices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
        <AlertTriangle className="h-12 w-12 text-slate-400 mb-3" />
        <h3 className="text-lg font-semibold text-slate-700">No Notices Yet</h3>
        <p className="text-sm text-muted-foreground">You haven't received any notices.</p>
      </div>
    );
  }

  // Group notices by date
  const groupedByDate = notices.reduce(
    (acc, notice) => {
      const dateKey = formatDate(notice.createdAt);
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(notice);
      return acc;
    },
    {} as Record<string, Notice[]>
  );

  const sortedDates = Object.keys(groupedByDate).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <div className="space-y-4">
      {sortedDates.map((dateKey) => (
        <div key={dateKey} className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Calendar className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">{dateKey}</h3>
          </div>

          <div className="space-y-2">
            {groupedByDate[dateKey].map((notice) => (
              <Card
                key={notice.id}
                className="border-red-200 bg-linear-to-r from-red-50 to-rose-50 shadow-sm hover:shadow-md transition-shadow"
              >
                <CardContent className="px-4 py-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-red-600 text-white text-[10px] px-2 py-0.5">
                        Notice
                      </Badge>

                      {notice.isEdited && (
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                          Edited
                        </Badge>
                      )}

                      <span className="text-[11px] text-muted-foreground">
                        {formatTime(notice.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-red-900 wrap-break-word">
                      {notice.title}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
