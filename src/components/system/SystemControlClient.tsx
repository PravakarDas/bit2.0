"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { checkZktecoServer, updateSystemControlConfig } from "@/actions/system-control.actions";

type SettingsState = {
  appTimezone: string;
  timelineCronEnabled: boolean;
  timelineCronHour: number;
  timelineCronMinute: number;
  zktecoCronEnabled: boolean;
  zktecoCronHour: number;
  zktecoCronMinute: number;
  leaveAutomationCronEnabled: boolean;
  leaveAutomationCronHour: number;
  leaveAutomationCronMinute: number;
  zktecoBaseUrl: string;
  zktecoUsername: string;
  zktecoPassword: string;
};

type ChangeLog = {
  id: string;
  actorName: string;
  actorEmail: string | null;
  actorRole: string;
  actorIsManager: boolean;
  changedFields: string[];
  createdAt: Date;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
};

interface SystemControlClientProps {
  initialSettings: SettingsState;
  canEditSensitive: boolean;
  isManager: boolean;
  logs: ChangeLog[];
}

function twoDigits(value: number) {
  return String(Math.max(0, value)).padStart(2, "0");
}

function formatHistoryValue(value: unknown) {
  if (typeof value === "boolean") {
    return value ? "Enabled" : "Disabled";
  }

  if (value === null || value === undefined || value === "") {
    return "--";
  }

  return String(value);
}

function formatHistoryField(field: string) {
  const labels: Record<string, string> = {
    appTimezone: "Timezone",
    timelineCronEnabled: "Timeline Cron",
    timelineCronHour: "Timeline Hour",
    timelineCronMinute: "Timeline Minute",
    zktecoCronEnabled: "ZKTeco Sync Cron",
    zktecoCronHour: "ZKTeco Hour",
    zktecoCronMinute: "ZKTeco Minute",
    leaveAutomationCronEnabled: "Leave Automation Cron",
    leaveAutomationCronHour: "Leave Hour",
    leaveAutomationCronMinute: "Leave Minute",
    zktecoBaseUrl: "ZKTeco Base URL",
    zktecoUsername: "ZKTeco Username",
    zktecoPassword: "ZKTeco Password",
  };

  return labels[field] || field;
}

export default function SystemControlClient({
  initialSettings,
  canEditSensitive,
  isManager,
  logs,
}: SystemControlClientProps) {
  const [form, setForm] = useState<SettingsState>(initialSettings);
  const [isSaving, startSave] = useTransition();
  const [isCheckingServer, startCheckingServer] = useTransition();
  const [serverStatus, setServerStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const cronRows = useMemo(() => ([
    {
      key: "timeline",
      label: "Timeline Creation",
      enabled: form.timelineCronEnabled,
      hour: form.timelineCronHour,
      minute: form.timelineCronMinute,
    },
    {
      key: "zkteco",
      label: "ZKTeco Sync",
      enabled: form.zktecoCronEnabled,
      hour: form.zktecoCronHour,
      minute: form.zktecoCronMinute,
    },
    {
      key: "leave",
      label: "Leave Automation",
      enabled: form.leaveAutomationCronEnabled,
      hour: form.leaveAutomationCronHour,
      minute: form.leaveAutomationCronMinute,
    },
  ]), [form]);

  useEffect(() => {
    if (!form.zktecoBaseUrl.trim()) {
      setServerStatus(null);
      return;
    }

    const timer = setTimeout(() => {
      startCheckingServer(async () => {
        const result = await checkZktecoServer(form.zktecoBaseUrl);
        setServerStatus(result);
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [form.zktecoBaseUrl]);

  const setCronEnabled = (key: "timeline" | "zkteco" | "leave", value: boolean) => {
    if (key === "timeline") setForm((prev) => ({ ...prev, timelineCronEnabled: value }));
    if (key === "zkteco") setForm((prev) => ({ ...prev, zktecoCronEnabled: value }));
    if (key === "leave") setForm((prev) => ({ ...prev, leaveAutomationCronEnabled: value }));
  };

  const setCronHour = (key: "timeline" | "zkteco" | "leave", value: number) => {
    const next = Math.min(23, Math.max(0, Number.isNaN(value) ? 0 : value));
    if (key === "timeline") setForm((prev) => ({ ...prev, timelineCronHour: next }));
    if (key === "zkteco") setForm((prev) => ({ ...prev, zktecoCronHour: next }));
    if (key === "leave") setForm((prev) => ({ ...prev, leaveAutomationCronHour: next }));
  };

  const setCronMinute = (key: "timeline" | "zkteco" | "leave", value: number) => {
    const next = Math.min(59, Math.max(0, Number.isNaN(value) ? 0 : value));
    if (key === "timeline") setForm((prev) => ({ ...prev, timelineCronMinute: next }));
    if (key === "zkteco") setForm((prev) => ({ ...prev, zktecoCronMinute: next }));
    if (key === "leave") setForm((prev) => ({ ...prev, leaveAutomationCronMinute: next }));
  };

  const handleSave = () => {
    startSave(async () => {
      try {
        const result = await updateSystemControlConfig(form);
        if (result.success) {
          toast.success(result.message || "Saved successfully");
        } else {
          toast.error("Failed to save settings");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save settings");
      }
    });
  };

  const handleBlurCheck = () => {
    if (!form.zktecoBaseUrl.trim()) return;
    startCheckingServer(async () => {
      const result = await checkZktecoServer(form.zktecoBaseUrl);
      setServerStatus(result);
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>System Control</CardTitle>
          <CardDescription>
            Manage cron schedules and ZKTeco integration settings at runtime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="timezone">Application Timezone</Label>
            <Input
              id="timezone"
              value={form.appTimezone}
              onChange={(e) => setForm((prev) => ({ ...prev, appTimezone: e.target.value }))}
              placeholder="Asia/Dhaka"
            />
          </div>

          <div className="space-y-3">
            <Label>Cron Jobs</Label>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Hour (0-23)</TableHead>
                    <TableHead>Minute (0-59)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cronRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell>
                        <Switch
                          checked={row.enabled}
                          onCheckedChange={(checked) => setCronEnabled(row.key as "timeline" | "zkteco" | "leave", checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          value={row.hour}
                          onChange={(e) => setCronHour(row.key as "timeline" | "zkteco" | "leave", Number(e.target.value))}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={59}
                          value={row.minute}
                          onChange={(e) => setCronMinute(row.key as "timeline" | "zkteco" | "leave", Number(e.target.value))}
                          className="w-24"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-4">
            <Label>ZKTeco Integration</Label>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="baseUrl">Base URL</Label>
                <Input
                  id="baseUrl"
                  value={form.zktecoBaseUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, zktecoBaseUrl: e.target.value }))}
                  onBlur={handleBlurCheck}
                  placeholder="http://119.10.168.198:8121"
                />
                {isCheckingServer ? (
                  <p className="text-xs text-muted-foreground">Checking server status...</p>
                ) : serverStatus ? (
                  <p className={`text-xs ${serverStatus.ok ? "text-green-600" : "text-amber-600"}`}>
                    {serverStatus.ok ? "Server is up" : `Caution: ${serverStatus.message}`}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={form.zktecoUsername}
                  disabled={!canEditSensitive}
                  onChange={(e) => setForm((prev) => ({ ...prev, zktecoUsername: e.target.value }))}
                  placeholder={canEditSensitive ? "Enter username" : "Admin only"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.zktecoPassword}
                  disabled={!canEditSensitive}
                  onChange={(e) => setForm((prev) => ({ ...prev, zktecoPassword: e.target.value }))}
                  placeholder={canEditSensitive ? "Enter password" : "Admin only"}
                />
              </div>
            </div>

            {!canEditSensitive && (
              <p className="text-xs text-muted-foreground">
                Only Admin/HR can edit ZKTeco username and password.
              </p>
            )}

            {isManager && (
              <p className="text-xs text-muted-foreground">
                Manager changes are allowed and will automatically notify admin.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
            <Badge variant="outline">
              Timeline: {twoDigits(form.timelineCronHour)}:{twoDigits(form.timelineCronMinute)}
            </Badge>
            <Badge variant="outline">
              ZKTeco: {twoDigits(form.zktecoCronHour)}:{twoDigits(form.zktecoCronMinute)}
            </Badge>
            <Badge variant="outline">
              Leave: {twoDigits(form.leaveAutomationCronHour)}:{twoDigits(form.leaveAutomationCronMinute)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change History</CardTitle>
          <CardDescription>Who changed what and when.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Changed Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">No changes logged yet.</TableCell>
                  </TableRow>
                ) : logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{log.actorName}</span>
                      </div>
                    </TableCell>
                    <TableCell>{format(new Date(log.createdAt), "yyyy-MM-dd HH:mm")}</TableCell>
                    <TableCell className="text-sm space-y-1">
                      {log.changedFields
                        .filter((field) => {
                          const previousValue = formatHistoryValue(log.previousValues?.[field]);
                          const newValue = formatHistoryValue(log.newValues?.[field]);
                          return previousValue !== newValue;
                        })
                        .map((field) => {
                          const previousValue = formatHistoryValue(log.previousValues?.[field]);
                          const newValue = formatHistoryValue(log.newValues?.[field]);

                          return (
                            <div key={field} className="leading-5">
                              <span className="font-medium">{formatHistoryField(field)}:</span>{" "}
                              <span className="line-through text-muted-foreground">{previousValue}</span>
                              <span className="mx-2">→</span>
                              <span>{newValue}</span>
                            </div>
                          );
                        })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
