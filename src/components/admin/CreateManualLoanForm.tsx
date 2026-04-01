"use client";

import { useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createManualLoan } from "@/actions/manual-loan.actions";
import { Loader2, Search } from "lucide-react";

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
  paidAmount: z.string().min(1, "Paid amount is required").refine(
    (v) => !isNaN(Number(v)) && Number(v) >= 0,
    "Paid amount must be 0 or more"
  ),
  reason: z.string().optional(),
}).superRefine((data, ctx) => {
  const loanAmount = Number(data.loanAmount) || 0;
  const paidAmount = Number(data.paidAmount) || 0;

  if (paidAmount > loanAmount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paidAmount"],
      message: "Paid amount cannot exceed loan amount",
    });
  }
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
  const [employeeSearchInput, setEmployeeSearchInput] = useState("");
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);

  const form = useForm<ManualLoanFormValues>({
    resolver: zodResolver(manualLoanSchema),
    defaultValues: {
      userId: "",
      loanAmount: "50000",
      startDate: "",
      endDate: "",
      gracePeriodMonths: "3",
      paidAmount: "0",
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
        paidInstallmentAmount: Number(data.paidAmount),
        reason: data.reason,
      });

      if (result.success) {
        toast.success(result.message || "Manual loan created successfully");
        form.reset();
        setSelectedEmployee(null);
        setEmployeeSearchInput("");
        setEmployeeSearchQuery("");
        setShowSearchResults(false);
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
  const gracePeriodMonthsStr = form.watch("gracePeriodMonths");
  const paidAmountStr = form.watch("paidAmount");

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
  const gracePeriodMonths = Number(gracePeriodMonthsStr) || 0;
  const emiMonths = Math.max(0, totalMonths - gracePeriodMonths);
  const paidAmount = Number(paidAmountStr) || 0;
  const baseMonthlyEmi = emiMonths > 0 ? Math.round(loanAmount / emiMonths) : 0;
  const remainingPrincipal = Math.max(0, loanAmount - paidAmount);
  const emiStartDate = startDate
    ? new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + gracePeriodMonths, 1)
    : null;
  const currentDate = new Date();
  const monthsElapsedSinceEmiStart = emiStartDate
    ? Math.max(
        0,
        (currentDate.getFullYear() - emiStartDate.getFullYear()) * 12 +
          (currentDate.getMonth() - emiStartDate.getMonth())
      )
    : 0;
  const remainingEmiMonths = Math.max(1, emiMonths - monthsElapsedSinceEmiStart);
  const previewMonthlyEmi = emiMonths > 0 ? Math.round(remainingPrincipal / remainingEmiMonths) : 0;

  const searchableEmployees = useMemo(() => {
    const query = employeeSearchQuery.trim().toLowerCase();
    if (!query) return [] as Employee[];

    return employees.filter((emp) => {
      const fullName = `${emp.firstName || ""} ${emp.lastName || ""}`.trim().toLowerCase();
      return fullName.includes(query) || emp.email.toLowerCase().includes(query);
    });
  }, [employeeSearchQuery, employees]);

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
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
              <Input
                value={employeeSearchInput}
                onChange={(e) => setEmployeeSearchInput(e.target.value)}
                placeholder="Search employee by name or email"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEmployeeSearchQuery(employeeSearchInput.trim().toLowerCase());
                  setShowSearchResults(true);
                }}
              >
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEmployeeSearchInput("");
                  setEmployeeSearchQuery("");
                  setShowSearchResults(false);
                  form.setValue("userId", "");
                  setSelectedEmployee(null);
                }}
              >
                Clear
              </Button>
            </div>

            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employee *</FormLabel>
                  <FormControl>
                    <Input type="hidden" {...field} />
                  </FormControl>

                  <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                    <div className="text-sm text-muted-foreground">
                      {selectedEmployee
                        ? "Selected employee"
                        : "Search and select an employee from the results below"}
                    </div>

                    {selectedEmployee ? (
                      <div className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
                        <div>
                          <p className="font-medium">
                            {selectedEmployee.firstName} {selectedEmployee.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">{selectedEmployee.email}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            field.onChange("");
                            setSelectedEmployee(null);
                          }}
                        >
                          Change
                        </Button>
                      </div>
                    ) : null}

                    {showSearchResults && employeeSearchQuery ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {searchableEmployees.length > 0 ? (
                          searchableEmployees.map((emp) => (
                            <button
                              key={emp.id}
                              type="button"
                              className="w-full rounded-md border bg-background p-3 text-left hover:bg-accent transition-colors"
                              onClick={() => {
                                field.onChange(emp.id);
                                setSelectedEmployee(emp);
                                setShowSearchResults(false);
                              }}
                            >
                              <div className="font-medium">
                                {emp.firstName} {emp.lastName}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {emp.email}
                                {emp.baseSalary !== null
                                  ? ` • Base Salary: ৳${emp.baseSalary.toLocaleString("en-BD")}`
                                  : ""}
                              </div>
                            </button>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground px-1">No employees found.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Loan Duration</p>
                      <p className="font-semibold">{totalMonths} months</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">EMI Months</p>
                      <p className="font-semibold">{emiMonths} months</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Base EMI</p>
                      <p className="font-semibold">
                        ৳{baseMonthlyEmi.toLocaleString("en-BD")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Preview EMI</p>
                      <p className="font-semibold text-primary">
                        ৳{previewMonthlyEmi.toLocaleString("en-BD")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {remainingEmiMonths} month(s) remaining from today
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

            {/* Paid Amount */}
            <FormField
              control={form.control}
              name="paidAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid Installment Amount (৳) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max={loanAmount || 300000}
                      step="1"
                      placeholder="0"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Total amount already paid toward this loan
                    {loanAmount > 0 && ` (max: ৳${loanAmount.toLocaleString("en-BD")})`}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {paidAmount > 0 && emiMonths > 0 && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Paid</p>
                      <p className="font-semibold">
                        ৳{paidAmount.toLocaleString("en-BD")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Remaining Principal</p>
                      <p className="font-semibold">
                        ৳{remainingPrincipal.toLocaleString("en-BD")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Calculated EMI</p>
                      <p className="font-semibold">
                        ৳{previewMonthlyEmi.toLocaleString("en-BD")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Based on {remainingEmiMonths} remaining month(s)
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
