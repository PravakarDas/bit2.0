"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { NotificationPreferenceViewModel } from "@/lib/services/notification-engine";
import { getMyNotificationPreferences, setMyNotificationPreference } from "@/actions/notification-preferences.actions";

interface NotificationPreferencesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/** Employee self-service notification preference management (Phase 13). One toggle per manageable (notificationType, channel) pair — see preference-catalog.ts for the full list. */
export function NotificationPreferencesDialog({ open, onOpenChange }: NotificationPreferencesDialogProps) {
    const [preferences, setPreferences] = useState<NotificationPreferenceViewModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingKey, setPendingKey] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        getMyNotificationPreferences()
            .then((result) => {
                if (result.success) {
                    setPreferences(result.preferences);
                } else {
                    toast.error(result.error);
                }
            })
            .finally(() => setLoading(false));
    }, [open]);

    const handleToggle = async (item: NotificationPreferenceViewModel, isEnabled: boolean) => {
        const key = `${item.notificationType}:${item.channel}`;
        setPendingKey(key);
        setPreferences((prev) =>
            prev.map((p) => (p.notificationType === item.notificationType && p.channel === item.channel ? { ...p, isEnabled } : p))
        );

        const result = await setMyNotificationPreference(item.notificationType, item.channel, isEnabled);
        setPendingKey(null);
        if (!result.success) {
            toast.error(result.error);
            setPreferences((prev) =>
                prev.map((p) =>
                    p.notificationType === item.notificationType && p.channel === item.channel ? { ...p, isEnabled: !isEnabled } : p
                )
            );
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Notification Preferences</DialogTitle>
                    <DialogDescription>Choose which email notifications you want to receive.</DialogDescription>
                </DialogHeader>

                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading preferences...</p>
                ) : preferences.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No notification preferences are configurable yet.</p>
                ) : (
                    <div className="space-y-4">
                        {preferences.map((item) => {
                            const key = `${item.notificationType}:${item.channel}`;
                            return (
                                <div key={key} className="flex items-center justify-between gap-4">
                                    <div>
                                        <Label htmlFor={key} className="text-sm font-medium">
                                            {item.label}
                                        </Label>
                                        <p className="text-xs text-muted-foreground">{item.description}</p>
                                    </div>
                                    <Switch
                                        id={key}
                                        checked={item.isEnabled}
                                        disabled={pendingKey === key}
                                        onCheckedChange={(checked) => handleToggle(item, checked)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
