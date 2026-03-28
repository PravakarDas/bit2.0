"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createManualLoan } from "@/actions/manual-loan.actions";
import { Loader2 } from "lucide-react";

const manualLoanSchema = z.object({
  userId: z.string().min(1, "Please select an employee"),
  loanAmount: z.string().min(1, "Loan amount is required").refine(
    (v) => !isNaN(Number(v)) && Number(v) >= 1000 && Number(v) <= 300000,
    "Loan amount must be between 1,000 and 300,000"
  ),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  gracePeriodMonths: z.string().min(1, "Grace period is required").refine(
    (v) => !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 120,
    "Grace period must be between 0 and 120 months"
  ),
  paidInstallments: z.string().min(1, "Paid installments is required").refine(
    (v) => !isNaN(Number(v)) && Number(v) >= 0,
    "Paid installments must be 0 or more"
  ),
  reason: z.string().optional(),
});

type ManualLoanFormValues = z.infer<typeof manualLoanSchema>;

interface Employee {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  baseSalary: number | null;
}

interface CreateManualLoanFormProps {
  employees: Employee[];
  onSuccess?: () => void;
}

export function CreateManualLoanForm({
  employees,
  onSuccess,
}: CreateManualLoanFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const form = useForm<ManualLoanFormValues>({
    resolver: zodResolver(manualLoanSchema),
    defaultValues: {
      userId: "",
      loanAmount: "50000",
      startDate: "",
      endDate: "",
      gracePeriodMonths: "3",
      paidInstallments: "0",
      reason: "",
    },
  });

  async function onSubmit(data: ManualLoanFormValues) {
    setIsSubmitting(true);
    try {
      const result = await createManualLoan({
        userId: data.userId,
        loanAmount: Number(data.loanAmount),
        startDate: data.startDate,
        endDate: data.endDate,
        gracePeriodMonths: Number(data.gracePeriodMonths),
        paidInstallments: Number(data.paidInstallments),
        reason: data.reason,
      });

      if (result.success) {
        toast.success(result.message || "Manual loan created successfully");
        form.reset();
        setSelectedEmployee(null);
        if (onSuccess) onSuccess();
      } else {
        toast.error(result.error || "Failed to create manual loan");
      }
    } catch (error) {
      console.error("Error creating manual loan:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  }

  const startDate = form.watch("startDate");
  const endDate = form.watch("endDate");
  const paidInstallmentsStr = form.watch("paidInstallments");

  // Calculate months between dates
  let totalMonths = 0;
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    totalMonths =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
  }

  const loanAmountStr = form.watch("loanAmount");
  const loanAmount = Number(loanAmountStr) || 0;
  const paidInstallments = Number(paidInstallmentsStr) || 0;
  const monthlyEmi = totalMonths > 0 ? Math.round(loanAmount / totalMonths) : 0;
  const totalPaid = monthlyEmi * paidInstallments;
  const remainingPrincipal = Math.max(0, loanAmount - totalPaid);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Manual Loan</CardTitle>
        <CardDescription>
          Register an existing/ongoing loan for an employee
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Employee Selection */}
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employee *</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      const emp = employees.find((e) => e.id === value);
                      setSelectedEmployee(emp || null);
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an employee" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName} ({emp.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedEmployee && (
                    <FormDescription>
                      Base Salary: ৳{selectedEmployee.baseSalary?.toLocaleString("en-BD")}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Loan Amount */}
            <FormField
              control={form.control}
              name="loanAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loan Amount (৳) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1000"
                      max="300000"
                      step="1000"
                      placeholder="50000"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Maximum eligible: ৳300,000
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Loan Period */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {totalMonths > 0 && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Loan Duration</p>
                      <p className="font-semibold">{totalMonths} months</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Monthly EMI</p>
                      <p className="font-semibold">
                        ৳{monthlyEmi.toLocaleString("en-BD")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Grace Period */}
            <FormField
              control={form.control}
              name="gracePeriodMonths"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grace Period (Months) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max="120"
                      placeholder="3"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Number of months before EMI starts
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Paid Installments */}
            <FormField
              control={form.control}
              name="paidInstallments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid Installments (Months) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max={totalMonths || 120}
                      placeholder="0"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Number of installments already paid
                    {totalMonths > 0 && ` (max: ${totalMonths})`}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {paidInstallments > 0 && totalMonths > 0 && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Paid</p>
                      <p className="font-semibold">
                        ৳{totalPaid.toLocaleString("en-BD")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Remaining Principal</p>
                      <p className="font-semibold">
                        ৳{remainingPrincipal.toLocaleString("en-BD")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Remaining Months</p>
                      <p className="font-semibold">
                        {totalMonths - paidInstallments} months
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reason */}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., Legacy loan transfer, Previous company carryover..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Creating..." : "Create Manual Loan"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
