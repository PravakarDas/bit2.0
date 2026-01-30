"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileUpdateRequestsList } from "@/components/admin/ProfileUpdateRequestsList";
import { getPendingProfileUpdateRequests } from "@/actions/profile.actions";
import { Loader2, Bell } from "lucide-react";
import { toast } from "sonner";

export default function ProfileRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const result = await getPendingProfileUpdateRequests();
      if (result.success && result.data) {
        setRequests(result.data);
      } else {
        toast.error(result.error || "Failed to load requests");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load requests");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile Update Requests</h1>
        <p className="text-muted-foreground">
          Review and approve employee profile update requests
        </p>
      </div>

      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <Bell className="h-5 w-5" />
            Pending Requests
          </CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading..."
              : `${requests.length} pending request${requests.length !== 1 ? "s" : ""}`}
          </CardDescription>
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ProfileUpdateRequestsList requests={requests} onUpdate={fetchRequests} />
      )}
    </div>
  );
}
