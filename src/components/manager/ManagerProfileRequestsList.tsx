"use client";

import { useState } from "react";
import { ProfileUpdateRequestsList } from "@/components/admin/ProfileUpdateRequestsList";
import { getPendingProfileUpdateRequestsForManager } from "@/actions/manager.actions";

interface ManagerProfileRequestsListProps {
  initialRequests: any[];
}

export function ManagerProfileRequestsList({ initialRequests }: ManagerProfileRequestsListProps) {
  const [requests, setRequests] = useState<any[]>(initialRequests);
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdate = async () => {
    setIsLoading(true);
    try {
      const updatedRequests = await getPendingProfileUpdateRequestsForManager();
      setRequests(updatedRequests);
    } catch (error) {
      console.error("Failed to refresh profile requests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProfileUpdateRequestsList 
      requests={requests} 
      onUpdate={handleUpdate} 
    />
  );
}