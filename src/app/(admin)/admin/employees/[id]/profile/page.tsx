"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileView } from "@/components/employee/ProfileView";
import { ProfileEditForm } from "@/components/employee/ProfileEditForm";
import { getUserProfileById } from "@/actions/profile.actions";
import { User } from "@prisma/client";
import { Loader2, ArrowLeft, Wallet, History } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { ManageEmployeeDialog } from "@/components/admin/ManageEmployeeDialog";

type UserWithBranch = User & {
  branch?: {
    id: string;
    name: string;
    location: string;
  } | null;
};

export default function AdminEmployeeProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  
  const [user, setUser] = useState<UserWithBranch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("view");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const result = await getUserProfileById(userId);

      if (result.success && result.data) {
        setUser(result.data as UserWithBranch);
      } else {
        toast.error(result.error || "Failed to load employee profile");
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
  }, [userId]);

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
          <Link href="/admin/employees">
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
        <div className="flex gap-2">
          <Link href={`/employees/${userId}/salary`}>
            <Button variant="outline">
              <History className="mr-2 h-4 w-4" />
              Salary History
            </Button>
          </Link>
          <ManageEmployeeDialog
            user={{
              id: user.id,
              email: user.email,
              role: user.role,
              branchId: user.branchId,
            }}
            branches={[]} // You'll need to fetch branches separately if needed
          />
        </div>
      </div>

      {/* Wallet & Salary Quick Info */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Wallet Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              ৳{user.walletBalance.toLocaleString("en-BD")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Base Salary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ৳{user.baseSalary.toLocaleString("en-BD")}
            </div>
          </CardContent>
        </Card>
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
            isAdmin={true}
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
