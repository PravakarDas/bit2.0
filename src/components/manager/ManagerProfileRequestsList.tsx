"use client";

import { useState, type ComponentProps } from "react";
import { ProfileUpdateRequestsList } from "@/components/admin/ProfileUpdateRequestsList";
import { getPendingProfileUpdateRequestsForManager } from "@/actions/manager.actions";

interface ManagerProfileRequestsListProps {
  initialRequests: ComponentProps<typeof ProfileUpdateRequestsList>["requests"];
}

export function ManagerProfileRequestsList({ initialRequests }: ManagerProfileRequestsListProps) {
  const [requests, setRequests] = useState<ComponentProps<typeof ProfileUpdateRequestsList>["requests"]>(initialRequests);

  const handleUpdate = async () => {
    try {
      const updatedRequests = await getPendingProfileUpdateRequestsForManager();
      setRequests(updatedRequests);
    } catch (error) {
      console.error("Failed to refresh profile requests:", error);
    }
  };

  return (
    <ProfileUpdateRequestsList 
      requests={requests} 
      onUpdate={handleUpdate} 
    />
  );
}