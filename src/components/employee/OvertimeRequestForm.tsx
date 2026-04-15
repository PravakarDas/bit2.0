"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Clock, Loader2 } from "lucide-react";
import { submitOvertimeRequest } from "@/actions/overtime-request.actions";
import { toast } from "sonner";

const overtimeRequestSchema = z.object({
  overtimeDate: z.date({
    message: "Please select a date for the overtime",
  }),
  requestedOTstart: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):([0-5][0-9])$/, "Use HH:MM format"),
  requestedOTend: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):([0-5][0-9])$/, "Use HH:MM format"),
  reason: z.string().min(10, "Please provide a detailed reason (at least 10 characters)"),
  taskNo: z.string().optional(),
}).refine((data) => {
  const [startHour, startMinute] = data.requestedOTstart.split(":").map(Number);
  const [endHour, endMinute] = data.requestedOTend.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  return endTotal > startTotal;
}, {
  path: ["requestedOTend"],
  message: "End time must be later than start time",
});

type OvertimeRequestFormValues = z.infer<typeof overtimeRequestSchema>;

interface OvertimeRequestFormProps {
  onSuccess?: () => void;
}

export function OvertimeRequestForm({ onSuccess }: OvertimeRequestFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<OvertimeRequestFormValues>({
    resolver: zodResolver(overtimeRequestSchema),
    defaultValues: {
      reason: "",
      taskNo: "",
      requestedOTstart: "",
      requestedOTend: "",
    },
  });

  const requestedOTstart = form.watch("requestedOTstart");
  const requestedOTend = form.watch("requestedOTend");

  const calculatedDuration = (() => {
    if (!requestedOTstart || !requestedOTend) return null;

    const [startHour, startMinute] = requestedOTstart.split(":").map(Number);
    const [endHour, endMinute] = requestedOTend.split(":").map(Number);
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;

    if (endTotal <= startTotal) return null;

    const diffMinutes = endTotal - startTotal;
    const hours = Math.floor(diffMinutes / 60).toString().padStart(2, "0");
    const minutes = (diffMinutes % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  })();

  async function onSubmit(values: OvertimeRequestFormValues) {
    setIsSubmitting(true);
    try {
      const result = await submitOvertimeRequest(values);

      if (result.success) {
        toast.success("Overtime request submitted successfully!");
        form.reset();
        onSuccess?.();
      } else {
        toast.error(result.error || "Failed to submit overtime request");
      }
    } catch (error) {
      console.error("Error submitting overtime request:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request Overtime Approval</CardTitle>
        <CardDescription>
          Submit a request to add overtime hours for a specific date. Your request will be reviewed by an administrator.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="overtimeDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Overtime Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ? field.value.toISOString().split('T')[0] : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          const date = new Date(e.target.value);
                          field.onChange(date);
                        }
                      }}
                      max={new Date().toISOString().split('T')[0]}
                      min="2000-01-01"
                    />
                  </FormControl>
                  <FormDescription>
                    Select the date for which you worked overtime
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="requestedOTstart"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Overtime Start Time</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="time"
                        {...field}
                        className="pl-10"
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Enter when your overtime started
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="requestedOTend"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Overtime End Time</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="time"
                        {...field}
                        className="pl-10"
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Enter when your overtime ended
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>Calculated Duration</FormLabel>
              <FormControl>
                <Input
                  value={calculatedDuration || "--:--"}
                  disabled
                />
              </FormControl>
              <FormDescription>
                Duration is automatically calculated from start and end time
              </FormDescription>
            </FormItem>

            <FormField
              control={form.control}
              name="taskNo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task/Project Reference (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., PROJ-123"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Reference number for the task or project you worked on
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Overtime</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Provide a detailed explanation for the overtime..."
                      className="min-h-25"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Explain why you worked overtime and what you accomplished
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
