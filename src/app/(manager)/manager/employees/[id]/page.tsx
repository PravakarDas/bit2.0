"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ProfileView } from "@/components/employee/ProfileView";
import { ProfileEditFormTabbed as ProfileEditForm } from "@/components/employee/ProfileEditFormTabbed";
import { getUserProfileById } from "@/actions/profile.actions";
import { getActiveBranches } from "@/actions/branch.actions";
import { User } from "@prisma/client";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

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

type BranchOption = {
  id: string;
  name: string;
  location: string;
};

export default function ManagerEmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [user, setUser] = useState<UserWithBranch | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("view");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [result, branchesResult] = await Promise.all([
        getUserProfileById(userId),
        getActiveBranches(),
      ]);

      if (result.success && result.data) {
        setUser(result.data as UserWithBranch);
      } else {
        toast.error(result.error || "Failed to load employee profile");
      }

      setBranches(branchesResult as BranchOption[]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Employee not found</p>
          <Button onClick={() => router.back()}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/manager/employees">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {user.firstName} {user.lastName}
            </h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="view">View Profile</TabsTrigger>
          <TabsTrigger value="edit">Edit Profile</TabsTrigger>
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
            branches={branches}
            isAdmin={true}
            allowRoleEdit={false}
            allowPersonalEdit={false}
            onSuccess={() => {
              setActiveTab("view");
              fetchData();
            }}
            onCancel={() => setActiveTab("view")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
