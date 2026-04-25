"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface EmployeeNoticeItem {
  id: string;
  title: string;
  isEdited: boolean;
  seenAt: Date | string | null;
  visibleUntil: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface BreakingNoticeBannerProps {
  notices: EmployeeNoticeItem[];
}

export function BreakingNoticeBanner({ notices }: BreakingNoticeBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [visibleNoticeIds, setVisibleNoticeIds] = useState<Set<string>>(new Set());
  const dragStartXRef = useRef<number | null>(null);
  const dragDeltaXRef = useRef(0);
  const hideTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Show only the 3 latest notices
  const limitedNotices = notices.slice(0, 3);
  const canSlide = limitedNotices.length > 1;

  const clearHideTimer = (noticeId: string) => {
    const timer = hideTimersRef.current.get(noticeId);
    if (timer) {
      clearTimeout(timer);
      hideTimersRef.current.delete(noticeId);
    }
  };

  const showNoticeTemporarily = (noticeId: string) => {
    clearHideTimer(noticeId);
    setVisibleNoticeIds((prev) => new Set([...prev, noticeId]));
    
    const timer = setTimeout(() => {
      setVisibleNoticeIds((prev) => {
        const next = new Set(prev);
        next.delete(noticeId);
        return next;
      });
      hideTimersRef.current.delete(noticeId);
    }, 3000);
    
    hideTimersRef.current.set(noticeId, timer);
  };

  const hideNoticeNow = (noticeId: string) => {
    clearHideTimer(noticeId);
    setVisibleNoticeIds((prev) => {
      const next = new Set(prev);
      next.delete(noticeId);
      return next;
    });
  };

  const toggleNoticeVisibility = (noticeId: string) => {
    if (visibleNoticeIds.has(noticeId)) {
      hideNoticeNow(noticeId);
    } else {
      showNoticeTemporarily(noticeId);
    }
  };

  useEffect(() => {
    return () => {
      hideTimersRef.current.forEach((timer) => clearTimeout(timer));
      hideTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!canSlide || isDragging) {
      return;
    }

    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % limitedNotices.length);
    }, 3500);

    return () => clearInterval(timer);
  }, [canSlide, isDragging, limitedNotices.length]);

  if (limitedNotices.length === 0) {
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
      setActiveIndex((prev) => (prev + 1) % limitedNotices.length);
    } else if (delta >= threshold) {
      setActiveIndex((prev) => (prev - 1 + limitedNotices.length) % limitedNotices.length);
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
          {limitedNotices.map((notice, index) => (
            <div key={notice.id} className="w-full shrink-0">
              <Card className="border-red-300 bg-linear-to-r from-red-50 to-rose-50 shadow-sm">
                <CardContent className="px-3 py-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-red-600 hover:bg-red-600 text-white text-[10px] px-2 py-0.5">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Notice
                      </Badge>

                      {notice.isEdited && (
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                          <Pencil className="mr-1 h-3 w-3" />
                          Edited
                        </Badge>
                      )}

                      <span className="text-[11px] text-muted-foreground">
                        {index + 1}/{limitedNotices.length}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleNoticeVisibility(notice.id)}
                      className={`text-sm font-semibold text-red-900 wrap-break-word leading-snug text-left w-full rounded px-1 py-0.5 transition-all ${
                        visibleNoticeIds.has(notice.id)
                          ? "bg-transparent"
                          : "bg-red-100/50 blur-sm select-none"
                      }`}
                      aria-label={visibleNoticeIds.has(notice.id) ? "Notice visible. Click to hide." : "Notice hidden. Click to reveal for 3 seconds."}
                    >
                      {notice.title}
                    </button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>

      {canSlide && (
        <div className="flex items-center justify-center gap-1.5">
          {limitedNotices.map((notice, index) => (
            <button
              key={notice.id}
              type="button"
              aria-label={`Go to notice ${index + 1}`}
              className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-4 bg-red-600" : "w-1.5 bg-red-300"}`}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
