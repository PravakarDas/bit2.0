"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotificationPaginationProps {
    page: number;
    totalPages: number;
    total: number;
    onPageChange: (page: number) => void;
}

export function NotificationPagination({ page, totalPages, total, onPageChange }: NotificationPaginationProps) {
    const pageNumbers = useMemo(() => {
        if (totalPages <= 1) return [];
        const windowSize = 5;
        let start = Math.max(1, page - Math.floor(windowSize / 2));
        const end = Math.min(totalPages, start + windowSize - 1);
        if (end - start + 1 < windowSize) {
            start = Math.max(1, end - windowSize + 1);
        }
        return Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
    }, [page, totalPages]);

    if (totalPages <= 1) {
        return (
            <p className="text-sm text-muted-foreground">
                {total} notification{total === 1 ? "" : "s"}
            </p>
        );
    }

    return (
        <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} &middot; {total} total
            </p>
            <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                {pageNumbers.map((p) => (
                    <Button key={p} variant={p === page ? "default" : "outline"} size="sm" onClick={() => onPageChange(p)}>
                        {p}
                    </Button>
                ))}
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
