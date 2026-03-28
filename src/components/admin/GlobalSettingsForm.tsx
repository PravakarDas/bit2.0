"use client";

import { useState } from "react";
import { updateSystemSettings } from "@/actions/settings.actions";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";

interface GlobalSettingsFormProps {
    initialData: {
        medicalClaimLimit: number;
    };
}

export function GlobalSettingsForm({ initialData }: GlobalSettingsFormProps) {
    const [formData, setFormData] = useState(initialData);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await updateSystemSettings(formData);
            if (res.success) {
                toast.success("Global configurations saved successfully");
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to update settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Medical Settings</CardTitle>
                    <CardDescription>
                        Default medical claim limit for all employees.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="medicalLimit">Annual Medical Limit (৳)</Label>
                            <Input
                                id="medicalLimit"
                                type="number"
                                value={formData.medicalClaimLimit}
                                onChange={(e) => setFormData({ ...formData, medicalClaimLimit: Number(e.target.value) })}
                            />
                        </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Medical Settings
                    </Button>
                </CardContent>
            </Card>
        </form>
    );
}
