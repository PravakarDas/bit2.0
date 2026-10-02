"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Clock, X } from "lucide-react";
import {
  bulkSetTimelineRecordsProcessed,
  bulkUpdateTimelineTimes,
  type BulkTimelineResult
} from "@/actions/timeline.actions";
import type { TimeRecord } from "@/components/admin/timeline-types";

type TimeTarget = "ACTUAL" | "REQUIRED";

const BREAK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function reportResult(result: BulkTimelineResult, verb: string) {
  if (result.error) {
    toast.error(result.error);
    return;
  }
  if (result.updated > 0) {
    toast.success(`${verb} ${result.updated} record(s)`);
  }
  if (result.failures.length > 0) {
    const shown = result.failures.slice(0, 5).map((f) => `${f.label}: ${f.error}`).join("\n");
    const more = result.failures.length > 5 ? `\n…and ${result.failures.length - 5} more` : "";
    toast.error(`${result.failures.length} record(s) not updated`, { description: shown + more, duration: 10000 });
  }
}

export default function TimelineBulkActions({
  selectedRecords,
  onClearSelection,
  onDone
}: {
  selectedRecords: TimeRecord[];
  onClearSelection: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [timeDialogOpen, setTimeDialogOpen] = useState(false);
  const [target, setTarget] = useState<TimeTarget>("ACTUAL");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [breakTime, setBreakTime] = useState("");

  const ids = selectedRecords.map((r) => r.id);
  const count = ids.length;

  const runProcessed = async (isProcessed: boolean) => {
    const targets = selectedRecords.filter((r) => r.isProcessed !== isProcessed);
    if (targets.length === 0) {
      toast.info(`All selected records are already ${isProcessed ? "processed" : "unprocessed"}`);
      return;
    }

    const noDataCount = targets.filter((r) => !r.actualCheckIn && !r.actualCheckOut).length;
    const message = isProcessed
      ? `Mark ${targets.length} record(s) as PROCESSED?` +
        (noDataCount > 0
          ? `\n\n${noDataCount} of them have no attendance data: each will first be checked against the attendance table; if nothing is found, it is marked as Weekly Off, deducted from leave balance, or Absent (with a full-day wallet deduction).`
          : "")
      : `Mark ${targets.length} record(s) as UNPROCESSED?\n\nThis clears their actual check-in/out, resets them to Present with the branch's required times, and reverses any wallet penalty or leave deduction applied for those days.`;
    if (!window.confirm(message)) return;

    setBusy(true);
    try {
      const result = await bulkSetTimelineRecordsProcessed(targets.map((r) => r.id), isProcessed);
      reportResult(result, isProcessed ? "Processed" : "Unprocessed");
      onDone();
    } catch (error) {
      console.error("Bulk processing failed:", error);
      toast.error("Failed to update processing status");
    } finally {
      setBusy(false);
    }
  };

  const openTimeDialog = () => {
    setTarget("ACTUAL");
    setCheckIn("");
    setCheckOut("");
    setBreakTime("");
    setTimeDialogOpen(true);
  };

  const applyTimes = async () => {
    if (!checkIn && !checkOut && !breakTime) {
      toast.error("Enter a check-in, check-out and/or break time");
      return;
    }
    if (breakTime && !BREAK_PATTERN.test(breakTime)) {
      toast.error("Break time must be a duration in HH:MM format, e.g. 01:00");
      return;
    }
    if (checkIn && checkOut && checkOut <= checkIn) {
      toast.error("Check-out must be after check-in");
      return;
    }

    setBusy(true);
    try {
      const result = await bulkUpdateTimelineTimes(ids, {
        target,
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        breakTime: breakTime || null
      });
      reportResult(result, "Updated");
      if (!result.error) {
        setTimeDialogOpen(false);
        onDone();
      }
    } catch (error) {
      console.error("Bulk time update failed:", error);
      toast.error("Failed to update times");
    } finally {
      setBusy(false);
    }
  };

  if (count === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-primary/5 px-4 py-2.5">
        <span className="text-sm font-medium">{count} selected</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => runProcessed(true)}>
            Mark as Processed
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => runProcessed(false)}>
            Mark as Unprocessed
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={openTimeDialog}>
            <Clock className="h-3.5 w-3.5" />
            Change Times
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onClearSelection}>
            <X className="h-3.5 w-3.5" />
            Clear selection
          </Button>
        </div>
      </div>

      <Dialog open={timeDialogOpen} onOpenChange={(open) => !busy && setTimeDialogOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change times for {count} record(s)</DialogTitle>
            <DialogDescription>
              Each time is applied on that record&apos;s own date. Leave a field blank to keep it unchanged.
              Active time, overtime/undertime and late penalty are recalculated for every record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <RadioGroup value={target} onValueChange={(v) => setTarget(v as TimeTarget)} className="grid gap-2">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="ACTUAL" id="bulk-target-actual" className="mt-0.5" />
                <Label htmlFor="bulk-target-actual" className="flex flex-col items-start gap-0.5">
                  <span className="font-medium">Actual check-in / check-out</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Absent / leave / weekly-off days become Present (penalty or leave deduction reversed); both times are needed for those.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="REQUIRED" id="bulk-target-required" className="mt-0.5" />
                <Label htmlFor="bulk-target-required" className="flex flex-col items-start gap-0.5">
                  <span className="font-medium">Required check-in / check-out</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Only applied to Present days; other days are skipped.
                  </span>
                </Label>
              </div>
            </RadioGroup>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-check-in">Check-in</Label>
                <Input id="bulk-check-in" type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-check-out">Check-out</Label>
                <Input id="bulk-check-out" type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="bulk-break-time">Break duration</Label>
                <Input
                  id="bulk-break-time"
                  placeholder="HH:MM, e.g. 01:00"
                  inputMode="numeric"
                  maxLength={5}
                  value={breakTime}
                  onChange={(e) => setBreakTime(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Total break length for the day, not a clock time.</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setTimeDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || (!checkIn && !checkOut && !breakTime)} onClick={applyTimes}>
              {busy ? "Applying…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
