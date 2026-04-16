"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Clock3, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface EmployeeNoticeItem {
  id: string;
  title: string;
  isEdited: boolean;
  senderName: string;
  seenAt: Date | string | null;
  visibleUntil: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface BreakingNoticeBannerProps {
  notices: EmployeeNoticeItem[];
}

function formatTimeLeft(visibleUntil: Date | string | null): string {
  if (!visibleUntil) {
    return "";
  }

  const end = new Date(visibleUntil).getTime();
  const now = Date.now();
  const diffMs = end - now;

  if (diffMs <= 0) {
    return "Expired";
  }

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) {
    return `${days}d ${hours}h left`;
  }

  return `${hours}h left`;
}

export function BreakingNoticeBanner({ notices }: BreakingNoticeBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef<number | null>(null);
  const dragDeltaXRef = useRef(0);

  const canSlide = notices.length > 1;

  useEffect(() => {
    if (!canSlide || isDragging) {
      return;
    }

    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % notices.length);
    }, 3500);

    return () => clearInterval(timer);
  }, [canSlide, isDragging, notices.length]);

  if (notices.length === 0) {
    return null;
  }

  const onDragStart = (clientX: number) => {
    if (!canSlide) {
      return;
    }

    dragStartXRef.current = clientX;
    dragDeltaXRef.current = 0;
    setIsDragging(true);
  };

  const onDragMove = (clientX: number) => {
    if (dragStartXRef.current === null) {
      return;
    }

    dragDeltaXRef.current = clientX - dragStartXRef.current;
  };

  const onDragEnd = () => {
    if (dragStartXRef.current === null) {
      return;
    }

    const threshold = 45;
    const delta = dragDeltaXRef.current;

    if (delta <= -threshold) {
      setActiveIndex((prev) => (prev + 1) % notices.length);
    } else if (delta >= threshold) {
      setActiveIndex((prev) => (prev - 1 + notices.length) % notices.length);
    }

    dragStartXRef.current = null;
    dragDeltaXRef.current = 0;
    setIsDragging(false);
  };

  return (
    <div className="space-y-2">
      <div
        className="overflow-hidden"
        onMouseDown={(event) => onDragStart(event.clientX)}
        onMouseMove={(event) => {
          if (!isDragging) {
            return;
          }
          onDragMove(event.clientX);
        }}
        onMouseUp={onDragEnd}
        onMouseLeave={() => {
          if (isDragging) {
            onDragEnd();
          }
        }}
        onTouchStart={(event) => onDragStart(event.touches[0].clientX)}
        onTouchMove={(event) => onDragMove(event.touches[0].clientX)}
        onTouchEnd={onDragEnd}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {notices.map((notice, index) => (
            <div key={notice.id} className="w-full shrink-0">
              <Card className="border-amber-300 bg-linear-to-r from-amber-50 to-orange-50 shadow-sm">
                <CardContent className="px-3 py-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-amber-600 hover:bg-amber-600 text-white text-[10px] px-2 py-0.5">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Notice
                      </Badge>

                      {notice.isEdited && (
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                          <Pencil className="mr-1 h-3 w-3" />
                          Edited
                        </Badge>
                      )}

                      <span className="inline-flex items-center text-[11px] text-muted-foreground">
                        <Clock3 className="mr-1 h-3 w-3" />
                        {formatTimeLeft(notice.visibleUntil)}
                      </span>

                      <span className="text-[11px] text-muted-foreground">
                        {index + 1}/{notices.length}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-amber-900 wrap-break-word leading-snug">{notice.title}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>

      {canSlide && (
        <div className="flex items-center justify-center gap-1.5">
          {notices.map((notice, index) => (
            <button
              key={notice.id}
              type="button"
              aria-label={`Go to notice ${index + 1}`}
              className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-4 bg-amber-600" : "w-1.5 bg-amber-300"}`}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
