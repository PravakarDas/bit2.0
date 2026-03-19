"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Crown } from "lucide-react";
import { toast } from "sonner";
import { toggleManagerStatus } from "@/actions/user.actions";

interface ManagerToggleProps {
    userId: string;
    isManager: boolean;
    userRole: string;
    userName?: string;
}

export function ManagerToggle({ userId, isManager, userRole }: ManagerToggleProps) {
    const [currentManagerStatus, setCurrentManagerStatus] = useState(isManager);
    const [isLoading, setIsLoading] = useState(false);

    const handleToggleManager = async () => {
        if (userRole !== "EMPLOYEE") {
            toast.error("Manager status can only be set for employees");
            return;
        }

        setIsLoading(true);
        try {
            const result = await toggleManagerStatus(userId);
            if (result.success) {
                setCurrentManagerStatus(result.isManager ?? currentManagerStatus);
                toast.success(result.message);
            } else {
                toast.error(result.error || "Failed to update manager status");
            }
        } catch {
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    if (userRole !== "EMPLOYEE") {
        return (
            <div className="flex items-center gap-2">
                <Badge variant="outline">Not applicable</Badge>
                <span className="text-xs text-muted-foreground">
                    (Only employees can be managers)
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            {currentManagerStatus ? (
                <Badge variant="default" className="gap-1">
                    <Crown className="h-3 w-3" />
                    Manager
                </Badge>
            ) : (
                <Badge variant="outline">Regular Employee</Badge>
            )}
            <Button
                variant={currentManagerStatus ? "destructive" : "default"}
                size="sm"
                onClick={handleToggleManager}
                disabled={isLoading}
                className="gap-1"
            >
                <Settings className="h-3 w-3" />
                {currentManagerStatus ? "Remove Manager" : "Make Manager"}
            </Button>
        </div>
    );
}