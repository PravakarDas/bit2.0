"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { NotificationPreferenceViewModel } from "@/lib/services/notification-engine";
import {
    getEmployeeNotificationPreferences,
    setEmployeeNotificationPreference,
    resetEmployeeNotificationPreference,
} from "@/actions/notification-preferences-admin.actions";

interface EmployeeOption {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    branch?: { id: string; name: string } | null;
}

interface EmployeeNotificationPreferencesPanelProps {
    users: EmployeeOption[];
}

function employeeLabel(user: EmployeeOption): string {
    return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
}

/** DEFAULT / EXPLICIT ENABLED / EXPLICIT DISABLED — never conflates "no row" with "disabled" (Phase 14 §3). */
function stateBadge(item: NotificationPreferenceViewModel) {
    if (!item.isExplicit) {
        return <Badge variant="secondary">Default (enabled)</Badge>;
    }
    return item.isEnabled ? <Badge variant="default">Explicitly enabled</Badge> : <Badge variant="destructive">Explicitly disabled</Badge>;
}

/**
 * SUPERADMIN/HR administrative view of a single employee's notification
 * preferences (Phase 14). Employee list + client-side search follows the
 * same pattern `EmployeeNotesBoard.tsx` already uses (`getUsers()` fetched
 * server-side, filtered here) — no new employee-picker primitive introduced.
 * All notification types/channels come from `MANAGEABLE_NOTIFICATION_TYPES`
 * via `NotificationPreferenceViewModel` — this component has no business
 * logic of its own about what LOAN_APPROVED (or any other event) means.
 */
export function EmployeeNotificationPreferencesPanel({ users }: EmployeeNotificationPreferencesPanelProps) {
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [preferences, setPreferences] = useState<NotificationPreferenceViewModel[]>([]);
    const [loading, setLoading] = useState(false);
    const [pendingKey, setPendingKey] = useState<string | null>(null);

    const normalizedSearch = search.trim().toLowerCase();
    const filteredUsers = users.filter((u) => {
        if (!normalizedSearch) return true;
        return employeeLabel(u).toLowerCase().includes(normalizedSearch) || u.email.toLowerCase().includes(normalizedSearch);
    });

    const selectedUser = users.find((u) => u.id === selectedId) ?? null;

    useEffect(() => {
        if (!selectedId) {
            setPreferences([]);
            return;
        }
        setLoading(true);
        getEmployeeNotificationPreferences(selectedId)
            .then((result) => {
                if (result.success) {
                    setPreferences(result.preferences);
                } else {
                    toast.error(result.error);
                    setPreferences([]);
                }
            })
            .finally(() => setLoading(false));
    }, [selectedId]);

    const reload = async () => {
        if (!selectedId) return;
        const result = await getEmployeeNotificationPreferences(selectedId);
        if (result.success) {
            setPreferences(result.preferences);
        }
    };

    const handleSetEnabled = async (item: NotificationPreferenceViewModel, isEnabled: boolean) => {
        if (!selectedId) return;
        const key = `${item.notificationType}:${item.channel}`;
        setPendingKey(key);
        const result = await setEmployeeNotificationPreference(selectedId, item.notificationType, item.channel, isEnabled);
        setPendingKey(null);
        if (result.success) {
            toast.success(`${item.label} (${item.channel}) ${isEnabled ? "enabled" : "disabled"} for ${employeeLabel(selectedUser!)}`);
            await reload();
        } else {
            toast.error(result.error);
        }
    };

    const handleReset = async (item: NotificationPreferenceViewModel) => {
        if (!selectedId) return;
        const key = `${item.notificationType}:${item.channel}`;
        setPendingKey(key);
        const result = await resetEmployeeNotificationPreference(selectedId, item.notificationType, item.channel);
        setPendingKey(null);
        if (result.success) {
            toast.success(`${item.label} (${item.channel}) reset to default for ${employeeLabel(selectedUser!)}`);
            await reload();
        } else {
            toast.error(result.error);
        }
    };

    return (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Employees</CardTitle>
                    <CardDescription>Select an employee to view or override their preferences.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    <div className="max-h-[420px] space-y-1 overflow-y-auto">
                        {filteredUsers.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">No employees found.</p>
                        ) : (
                            filteredUsers.map((u) => (
                                <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => setSelectedId(u.id)}
                                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                                        selectedId === u.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                                    }`}
                                >
                                    <p className="font-medium">{employeeLabel(u)}</p>
                                    <p className="text-xs text-muted-foreground">{u.email}</p>
                                </button>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Notification Preferences</CardTitle>
                    <CardDescription>
                        {selectedUser
                            ? `Managing preferences for ${employeeLabel(selectedUser)}.`
                            : "Select an employee on the left to manage their preferences."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!selectedId ? null : loading ? (
                        <p className="text-sm text-muted-foreground">Loading preferences...</p>
                    ) : preferences.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No notification preferences are configurable yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {preferences.map((item) => {
                                const key = `${item.notificationType}:${item.channel}`;
                                const isPending = pendingKey === key;
                                return (
                                    <div key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                                        <div>
                                            <p className="text-sm font-medium">{item.label}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {item.channel} · {item.description}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {stateBadge(item)}
                                            {item.isEnabled ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={isPending}
                                                    onClick={() => handleSetEnabled(item, false)}
                                                >
                                                    Disable
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={isPending}
                                                    onClick={() => handleSetEnabled(item, true)}
                                                >
                                                    Enable
                                                </Button>
                                            )}
                                            {item.isExplicit && (
                                                <Button variant="ghost" size="sm" disabled={isPending} onClick={() => handleReset(item)}>
                                                    Reset to Default
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
