"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileView } from "@/components/employee/ProfileView";
import { ProfileEditFormTabbed as ProfileEditForm } from "@/components/employee/ProfileEditFormTabbed";
import { NotificationPanel } from "@/components/employee/NotificationPanel";
import { getCurrentUserProfile, getMyProfileUpdateRequests } from "@/actions/profile.actions";
import { User } from "@prisma/client";
import { Loader2, Clock, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type UserWithBranch = User & {
  branch?: {
    id: string;
    name: string;
    location: string;
  } | null;
  department?: {
    id: string;
    name: string;
  } | null;
  designation?: {
    id: string;
    name: string;
  } | null;
};

export default function ProfilePage() {
  const [user, setUser] = useState<UserWithBranch | null>(null);
  const [updateRequests, setUpdateRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("view");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [userResult, requestsResult] = await Promise.all([
        getCurrentUserProfile(),
        getMyProfileUpdateRequests(),
      ]);

      if (userResult.success && userResult.data) {
        setUser(userResult.data as UserWithBranch);
      } else {
        toast.error(userResult.error || "Failed to load profile");
      }

      if (requestsResult.success && requestsResult.data) {
        setUpdateRequests(requestsResult.data);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Failed to load profile</p>
      </div>
    );
  }

  const pendingRequests = updateRequests.filter((r) => r.status === "PENDING");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">View and manage your personal information</p>
      </div>

      {pendingRequests.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <Clock className="h-5 w-5" />
              Pending Update Request
            </CardTitle>
            <CardDescription>
              You have {pendingRequests.length} pending profile update request(s) awaiting admin approval
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="view">View Profile</TabsTrigger>
          <TabsTrigger value="edit">Edit Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="requests">
            Update History
            {pendingRequests.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingRequests.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="view" className="space-y-6 mt-6">
          <ProfileView
            user={user}
            canEdit={true}
            onEdit={() => setActiveTab("edit")}
          />
        </TabsContent>

        <TabsContent value="edit" className="mt-6">
          <ProfileEditForm
            user={user}
            isAdmin={false}
            onSuccess={() => {
              setActiveTab("view");
              fetchData();
            }}
            onCancel={() => setActiveTab("view")}
          />
        </TabsContent>
        <TabsContent value="notifications" className="mt-6">
          <NotificationPanel userId={user.id} />
        </TabsContent>
        <TabsContent value="requests" className="mt-6">
          <div className="space-y-4">
            {updateRequests.length === 0 ? (
              <Card>
                <CardContent className="py-10">
                  <div className="text-center text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No profile update requests yet</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              updateRequests.map((request) => (
                <Card key={request.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">
                        Profile Update Request
                      </CardTitle>
                      <Badge
                        variant={
                          request.status === "APPROVED"
                            ? "default"
                            : request.status === "PENDING"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {request.status === "APPROVED" && (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        )}
                        {request.status === "REJECTED" && (
                          <XCircle className="h-3 w-3 mr-1" />
                        )}
                        {request.status === "PENDING" && (
                          <Clock className="h-3 w-3 mr-1" />
                        )}
                        {request.status}
                      </Badge>
                    </div>
                    <CardDescription>
                      Submitted on {format(new Date(request.createdAt), "PPP 'at' p")}
                      {request.reviewedAt && (
                        <> • Reviewed on {format(new Date(request.reviewedAt), "PPP 'at' p")}</>
                      )}
                    </CardDescription>
                  </CardHeader>
                  {request.reviewNotes && (
                    <CardContent>
                      <div className="rounded-lg bg-muted p-4">
                        <p className="text-sm font-semibold mb-1">Admin Notes:</p>
                        <p className="text-sm text-muted-foreground">{request.reviewNotes}</p>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

