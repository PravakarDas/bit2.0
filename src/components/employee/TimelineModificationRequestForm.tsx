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
import { format } from "date-fns";
import { submitTimelineModificationRequest } from "@/actions/timeline-modification-request.actions";
import { toast } from "sonner";

const timelineModificationSchema = z
  .object({
    requestedDate: z.date({
      message: "Please select a date",
    }),
    requestedCheckInTime: z.string().optional(),
    requestedCheckOutTime: z.string().optional(),
    requestedBreakTime: z
      .string()
      .optional()
      .refine((value) => !value || /^([0-9]{1,2}):([0-5][0-9])$/.test(value), {
        message: "Use HH:MM format (e.g., 01:00)",
      }),
    reason: z.string().optional(),
  })
  .refine(
    (data) => Boolean(data.requestedCheckInTime || data.requestedCheckOutTime || data.requestedBreakTime),
    {
      message: "Provide at least one requested modification",
      path: ["requestedBreakTime"],
    }
  );

type TimelineModificationFormValues = z.infer<typeof timelineModificationSchema>;

interface TimelineModificationRequestFormProps {
  onSuccess?: () => void;
}

function combineDateAndTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function TimelineModificationRequestForm({ onSuccess }: TimelineModificationRequestFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TimelineModificationFormValues>({
    resolver: zodResolver(timelineModificationSchema),
    defaultValues: {
      requestedCheckInTime: "",
      requestedCheckOutTime: "",
      requestedBreakTime: "",
      reason: "",
    },
  });

  async function onSubmit(values: TimelineModificationFormValues) {
    setIsSubmitting(true);
    try {
      const result = await submitTimelineModificationRequest({
        requestedDate: values.requestedDate,
        requestedCheckIn: values.requestedCheckInTime
          ? combineDateAndTime(values.requestedDate, values.requestedCheckInTime)
          : null,
        requestedCheckOut: values.requestedCheckOutTime
          ? combineDateAndTime(values.requestedDate, values.requestedCheckOutTime)
          : null,
        requestedBreakTime: values.requestedBreakTime || null,
        reason: values.reason || null,
      });

      if (result.success) {
        toast.success("Timeline modification request submitted successfully");
        form.reset();
        onSuccess?.();
      } else {
        toast.error(result.error || "Failed to submit request");
      }
    } catch (error) {
      console.error("Error submitting timeline modification request:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request Check-In/Out Modification</CardTitle>
        <CardDescription>
          Request corrections for today or previous dates. Manager or admin can approve/reject your request.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="requestedDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
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
                  <FormDescription>Only today and past dates are allowed</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="requestedCheckInTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Requested Check-In Time</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input type="time" {...field} className="pl-10" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requestedCheckOutTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Requested Check-Out Time</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input type="time" {...field} className="pl-10" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="requestedBreakTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Requested Break Duration (HH:MM)</FormLabel>
                  <FormControl>
                    <Input placeholder="01:00" {...field} />
                  </FormControl>
                  <FormDescription>
                    Optional. Example: 00:30 for 30 minutes
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
                  <FormLabel>Reason (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Explain why this timeline correction is needed..."
                      className="min-h-25"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional message for reviewer context
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
