"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarIcon, FilterIcon } from "lucide-react";

export function ArchiveFilters() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [fromDate, setFromDate] = useState(searchParams.get("fromDate") || "");
    const [toDate, setToDate] = useState(searchParams.get("toDate") || "");

    const handleFilter = () => {
        const params = new URLSearchParams();
        if (fromDate) params.set("fromDate", fromDate);
        if (toDate) params.set("toDate", toDate);
        
        router.push(`/admin/archived-employees?${params.toString()}`);
    };

    const handleClear = () => {
        setFromDate("");
        setToDate("");
        router.push("/admin/archived-employees");
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <FilterIcon className="h-5 w-5" />
                    Filter by Date Range
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-end gap-4">
                    <div className="flex-1">
                        <Label htmlFor="fromDate">From Date</Label>
                        <Input
                            id="fromDate"
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                        />
                    </div>
                    <div className="flex-1">
                        <Label htmlFor="toDate">To Date</Label>
                        <Input
                            id="toDate"
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleFilter} className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4" />
                            Filter
                        </Button>
                        <Button variant="outline" onClick={handleClear}>
                            Clear
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}