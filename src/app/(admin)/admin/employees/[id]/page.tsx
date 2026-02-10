"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileView } from "@/components/employee/ProfileView";
import { ProfileEditFormTabbed as ProfileEditForm } from "@/components/employee/ProfileEditFormTabbed";
import { getUserProfileById } from "@/actions/profile.actions";
import { User } from "@prisma/client";
import { Loader2, ArrowLeft, Wallet } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { getActiveBranches } from "@/actions/branch.actions";

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

export default function AdminEmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  
  const [user, setUser] = useState<UserWithBranch | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("view");

  const fetchData = async () => {
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
      
      setBranches(branchesResult);
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
      </div>

      {/* Wallet & Salary Quick Info */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link href={`/employees/${userId}/wallet`}>
          <Card className="bg-primary/5 border-primary/20 hover:bg-primary/10 transition-colors cursor-pointer">
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
        </Link>

        <Link href={`/employees/${userId}/salary`}>
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle>Base Salary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                ৳{user.baseSalary.toLocaleString("en-BD")}
              </div>
            </CardContent>
          </Card>
        </Link>
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
