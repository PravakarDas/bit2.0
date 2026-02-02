"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DepartmentClient from "@/components/admin/DepartmentClient";
import DesignationClient from "@/components/admin/DesignationClient";

export default function OrganizationClient() {
  const [activeTab, setActiveTab] = useState("departments");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organization Management</h1>
        <p className="text-muted-foreground">
          Manage departments and designations for your organization
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="designations">Designations</TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="mt-6">
          <DepartmentClient />
        </TabsContent>

        <TabsContent value="designations" className="mt-6">
          <DesignationClient />
        </TabsContent>
      </Tabs>
    </div>
  );
}
