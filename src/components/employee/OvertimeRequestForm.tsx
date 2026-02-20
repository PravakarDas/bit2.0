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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { submitOvertimeRequest } from "@/actions/overtime-request.actions";
import { toast } from "sonner";

const overtimeRequestSchema = z.object({
  overtimeDate: z.date({
    message: "Please select a date for the overtime",
  }),
  totalOvertime: z
    .string()
    .min(1, "Overtime duration is required")
    .regex(/^([0-9]{1,2}):([0-5][0-9])$/, "Use HH:MM format (e.g., 02:30)"),
  reason: z.string().min(10, "Please provide a detailed reason (at least 10 characters)"),
  taskNo: z.string().optional(),
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
      totalOvertime: "",
    },
  });

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
                <FormItem className="flex flex-col">
                  <FormLabel>Overtime Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("2000-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    Select the date for which you worked overtime
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="totalOvertime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Overtime Duration</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="e.g., 02:30"
                        {...field}
                        className="pl-10"
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Enter the duration in HH:MM format (e.g., 02:30 for 2 hours 30 minutes)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                      className="min-h-[100px]"
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
