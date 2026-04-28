"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteLoan } from "@/actions/manager-verification.actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface DeleteLoanButtonProps {
  loanId: string;
  employeeName: string;
  loanAmount: number;
  onDeleted?: () => void;
}

export function DeleteLoanButton({ loanId, employeeName, loanAmount, onDeleted }: DeleteLoanButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteLoan(loanId);

    if (result.success) {
      toast.success("Loan deleted successfully");
      onDeleted?.();
    } else {
      toast.error(result.error || "Failed to delete loan");
    }

    setIsDeleting(false);
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" aria-label={`Delete loan for ${employeeName}`}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Loan</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this loan for {employeeName}? This will permanently remove the loan,
            repayment records, EMI state, and loan audit logs. The user wallet will also be adjusted. This action cannot
            be undone.
          </AlertDialogDescription>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Loan amount: ৳{loanAmount.toLocaleString("en-BD")}
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={isDeleting} onClick={handleDelete}>
            {isDeleting ? "Deleting..." : "Delete Loan"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}