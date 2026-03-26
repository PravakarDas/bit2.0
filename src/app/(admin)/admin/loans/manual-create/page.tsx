import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateManualLoanForm } from "@/components/admin/CreateManualLoanForm";
import { Plus } from "lucide-react";

export default async function AdminLoansPage() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { role: true },
  });

  if (user?.role !== "SUPERADMIN") {
    redirect("/unauthorized");
  }

  // Fetch approved employees
  const employees = await prisma.user.findMany({
    where: {
      status: "APPROVED",
      isArchived: false,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      baseSalary: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Loan Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage employee loans including manual registration of ongoing loans
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="manual-create" className="w-full">
        <TabsList>
          <TabsTrigger value="manual-create" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Manual Loan
          </TabsTrigger>
        </TabsList>

        {/* Manual Loan Creation Tab */}
        <TabsContent value="manual-create" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Register Ongoing Loan</CardTitle>
              <CardDescription>
                For employees with existing ongoing loans that need to be registered in the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900 font-medium">How it works:</p>
                  <ul className="text-sm text-blue-800 mt-2 space-y-1 ml-4 list-disc">
                    <li>Select an employee who has an ongoing loan</li>
                    <li>Enter the total loan amount and duration (start/end dates)</li>
                    <li>Set grace period (months before EMI starts)</li>
                    <li>Enter how many installments have already been paid</li>
                    <li>The system automatically calculates remaining principal and EMI</li>
                    <li>Once created, the loan is treated as ACTIVE and counts toward eligibility for future loans</li>
                  </ul>
                </div>

                <CreateManualLoanForm employees={employees} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
