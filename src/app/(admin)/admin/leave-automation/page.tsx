"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export default function LeaveAutomationAdmin() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [backfillDays, setBackfillDays] = useState("7");

    const handleDailyProcess = async () => {
        setIsProcessing(true);
        try {
            const response = await fetch('/api/leave-automation', {
                method: 'POST',
            });
            const result = await response.json();
            
            if (result.success) {
                toast.success(`Daily automation completed. Processed ${result.data.processedEmployees} employees.`);
            } else {
                toast.error(result.error || "Failed to process daily automation");
            }
        } catch (error) {
            console.error("Error:", error);
            toast.error("Failed to process daily automation");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBackfillProcess = async () => {
        if (!backfillDays || parseInt(backfillDays) <= 0) {
            toast.error("Please enter a valid number of days");
            return;
        }

        setIsProcessing(true);
        try {
            const response = await fetch(`/api/leave-automation?backfill=${backfillDays}`, {
                method: 'POST',
            });
            const result = await response.json();
            
            if (result.success) {
                toast.success(`Backfill automation completed. Processed ${result.data.processedDates} dates.`);
            } else {
                toast.error(result.error || "Failed to process backfill automation");
            }
        } catch (error) {
            console.error("Error:", error);
            toast.error("Failed to process backfill automation");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Leave Automation Management</h1>
                <p className="text-muted-foreground">Manage automatic leave processing and weekly off day settings</p>
            </div>

            {/* System Status */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Automation Schedule
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div>
                                <p className="font-medium">Daily Processing</p>
                                <p className="text-sm text-muted-foreground">Runs every day at 22:00 (10 PM)</p>
                            </div>
                            <Badge variant="default">Active</Badge>
                        </div>
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div>
                                <p className="font-medium">Auto Leave Deduction</p>
                                <p className="text-sm text-muted-foreground">For &quot;Roster Every Year&quot; leave types only</p>
                            </div>
                            <Badge variant="default">Enabled</Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Manual Controls */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Play className="h-5 w-5" />
                            Manual Daily Process
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Manually trigger the daily leave automation process for yesterday&#39;s records.
                        </p>
                        <Button 
                            onClick={handleDailyProcess}
                            disabled={isProcessing}
                            className="w-full"
                        >
                            {isProcessing ? "Processing..." : "Process Yesterday"}
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <RotateCcw className="h-5 w-5" />
                            Backfill Processing
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Process past dates that haven&#39;t been processed yet.
                        </p>
                        <div className="grid gap-2">
                            <Label htmlFor="backfillDays">Number of days to backfill</Label>
                            <Input
                                id="backfillDays"
                                type="number"
                                min="1"
                                max="365"
                                value={backfillDays}
                                onChange={(e) => setBackfillDays(e.target.value)}
                                placeholder="Enter number of days"
                            />
                        </div>
                        <Button 
                            onClick={handleBackfillProcess}
                            disabled={isProcessing}
                            variant="outline"
                            className="w-full"
                        >
                            {isProcessing ? "Processing..." : "Start Backfill"}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Information Cards */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-600">
                            <Calendar className="h-5 w-5" />
                            Weekly Off Days
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            System automatically sets required and actual times to 0 for weekly off days based on branch settings.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-orange-600">
                            <Calendar className="h-5 w-5" />
                            Auto Leave Deduction
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Automatically deducts from &quot;Roster Every Year&quot; leave types when employee is absent and has available balance.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-600">
                            <Calendar className="h-5 w-5" />
                            No Leave Balance
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            When no leaves available, sets required times as per branch settings and actual times to 0.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}