"use client";

import { Button } from "@/components/ui/button";
import { processMonthlyEMIs } from "@/actions/loan.actions";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProcessEMIButton() {
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
    const [isPending, startTransition] = useTransition();

    const handleProcess = () => {
        startTransition(async () => {
            try {
                const result = await processMonthlyEMIs(month);
                if (result.errors.length > 0) {
                    toast.warning(`Processed ${result.processed}, Skipped ${result.skipped}, Failed ${result.failed}`, {
                        description: result.errors.slice(0, 3).join("\n") + (result.errors.length > 3 ? "..." : "")
                    });
                } else {
                    toast.success(`Processed ${result.processed} EMIs, Skipped ${result.skipped}`);
                }
                setOpen(false);
            } catch (error) {
                toast.error("Failed to process EMIs");
                console.error(error);
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="destructive">Process Monthly EMI</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Process Loan EMIs</DialogTitle>
                    <DialogDescription>
                        This will deduct EMI amounts from user wallets for all active loans for the selected month.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="month" className="text-right">
                            Month
                        </Label>
                        <Input
                            id="month"
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleProcess} disabled={isPending || !month} variant="destructive">
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Deduction
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
