"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { approveProfileUpdateRequest, rejectProfileUpdateRequest } from "@/actions/profile.actions";
import { format } from "date-fns";
import { Check, X, Clock, User, Calendar, Loader2 } from "lucide-react";

interface ProfileUpdateRequestWithUser {
  id: string;
  userId: string;
  status: string;
  requestedChanges: any;
  previousValues: any;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    imageUrl: string | null;
    role: string;
  };
}

interface ProfileUpdateRequestsListProps {
  requests: ProfileUpdateRequestWithUser[];
  onUpdate: () => void;
}

export function ProfileUpdateRequestsList({ requests, onUpdate }: ProfileUpdateRequestsListProps) {
  const [selectedRequest, setSelectedRequest] = useState<ProfileUpdateRequestWithUser | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    if (!selectedRequest) return;

    setIsProcessing(true);
    try {
      const result = await approveProfileUpdateRequest(selectedRequest.id, reviewNotes);
      if (result.success) {
        toast.success("Profile update request approved");
        setShowApproveDialog(false);
        setSelectedRequest(null);
        setReviewNotes("");
        onUpdate();
      } else {
        toast.error(result.error || "Failed to approve request");
      }
    } catch (error) {
      toast.error("An error occurred");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !reviewNotes.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await rejectProfileUpdateRequest(selectedRequest.id, reviewNotes);
      if (result.success) {
        toast.success("Profile update request rejected");
        setShowRejectDialog(false);
        setSelectedRequest(null);
        setReviewNotes("");
        onUpdate();
      } else {
        toast.error(result.error || "Failed to reject request");
      }
    } catch (error) {
      toast.error("An error occurred");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="text-center text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No pending profile update requests</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {requests.map((request) => (
          <Card key={request.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                    {request.user.firstName?.[0]}{request.user.lastName?.[0]}
                  </div>
                  <div>
                    <CardTitle className="text-lg">
                      {request.user.firstName} {request.user.lastName}
                    </CardTitle>
                    <CardDescription>
                      <div className="flex items-center gap-2 mt-1">
                        <User className="h-3 w-3" />
                        {request.user.email}
                        <span className="mx-2">•</span>
                        <Calendar className="h-3 w-3" />
                        {format(new Date(request.createdAt), "PPP")}
                      </div>
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedRequest(request);
                      setShowApproveDialog(true);
                    }}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setSelectedRequest(request);
                      setShowRejectDialog(true);
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2 text-sm">Requested Changes:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    {Object.entries(request.requestedChanges as Record<string, any>).map(([key, value]) => {
                      if (!value) return null;
                      const previousValue = request.previousValues?.[key];
                      
                      return (
                        <div key={key} className="border rounded-lg p-3">
                          <p className="font-medium text-muted-foreground capitalize mb-1">
                            {key.replace(/([A-Z])/g, " $1").trim()}
                          </p>
                          <div className="space-y-1">
                            {previousValue && (
                              <p className="text-xs text-muted-foreground line-through">
                                {formatValue(previousValue)}
                              </p>
                            )}
                            <p className="font-medium text-green-600">
                              {formatValue(value)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Profile Update</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this profile update request from{" "}
              {selectedRequest?.user.firstName} {selectedRequest?.user.lastName}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approve-notes">Review Notes (Optional)</Label>
            <Textarea
              id="approve-notes"
              placeholder="Add any notes about this approval..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowApproveDialog(false);
                setReviewNotes("");
              }}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={isProcessing}>
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Profile Update</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this profile update request from{" "}
              {selectedRequest?.user.firstName} {selectedRequest?.user.lastName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-notes">Rejection Reason *</Label>
            <Textarea
              id="reject-notes"
              placeholder="Explain why this request is being rejected..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={4}
              required
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setReviewNotes("");
              }}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isProcessing || !reviewNotes.trim()}
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date || (typeof value === "string" && !isNaN(Date.parse(value)))) {
    try {
      return format(new Date(value), "PPP");
    } catch {
      return String(value);
    }
  }
  return String(value);
}
