"use client";

import { useMemo, useState } from "react";
import {
  createBreakingNotice,
  deleteBreakingNotice,
  updateBreakingNotice,
} from "@/actions/breaking-notice.actions";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, Edit, Eye, Megaphone, Save, Trash2, User2, Users } from "lucide-react";
import { formatDateTime12 } from "@/lib/utils";

type TargetType = "ALL_EMPLOYEES" | "SINGLE_EMPLOYEE" | "SINGLE_BRANCH";

interface BranchOption {
  id: string;
  name: string;
}

interface EmployeeOption {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  branch: {
    id: string;
    name: string;
  } | null;
}

interface NoticeRecipient {
  id: string;
  status: boolean;
  seenAt: Date | string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    branch: {
      id: string;
      name: string;
    } | null;
  };
}

interface NoticeHistoryItem {
  id: string;
  title: string;
  targetType: TargetType;
  isEdited: boolean;
  version: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  sender: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  targetUser: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  targetBranch: {
    id: string;
    name: string;
  } | null;
  recipients: NoticeRecipient[];
}

interface BreakingNoticeManagementProps {
  notices: NoticeHistoryItem[];
  branches: BranchOption[];
  employees: EmployeeOption[];
  panelTitle: string;
  panelDescription: string;
}

function getUserDisplayName(user: { firstName: string | null; lastName: string | null; email: string }) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return "-";
  }

  return formatDateTime12(value);
}

export function BreakingNoticeManagement({
  notices,
  branches,
  employees,
  panelTitle,
  panelDescription,
}: BreakingNoticeManagementProps) {
  const [title, setTitle] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("ALL_EMPLOYEES");
  const [targetUserId, setTargetUserId] = useState("");
  const [targetUserSearch, setTargetUserSearch] = useState("");
  const [targetBranchId, setTargetBranchId] = useState("");
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedNoticeIds, setExpandedNoticeIds] = useState<Set<string>>(new Set());

  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        id: employee.id,
        label: `${getUserDisplayName(employee)} (${employee.branch?.name ?? "No Branch"})`,
        email: employee.email,
      })),
    [employees]
  );

  const filteredEmployeeOptions = useMemo(() => {
    const search = targetUserSearch.trim().toLowerCase();
    if (!search) {
      return employeeOptions;
    }

    return employeeOptions.filter((employee) =>
      employee.label.toLowerCase().includes(search) || employee.email.toLowerCase().includes(search)
    );
  }, [employeeOptions, targetUserSearch]);

  const resetForm = () => {
    setTitle("");
    setTargetType("ALL_EMPLOYEES");
    setTargetUserId("");
    setTargetUserSearch("");
    setTargetBranchId("");
    setEditingNoticeId(null);
  };

  const loadIntoForm = (notice: NoticeHistoryItem) => {
    setEditingNoticeId(notice.id);
    setTitle(notice.title);
    setTargetType(notice.targetType);
    setTargetUserId(notice.targetUser?.id ?? "");
    setTargetUserSearch("");
    setTargetBranchId(notice.targetBranch?.id ?? "");
  };

  const toggleExpanded = (noticeId: string) => {
    setExpandedNoticeIds((prev) => {
      const next = new Set(prev);
      if (next.has(noticeId)) {
        next.delete(noticeId);
      } else {
        next.add(noticeId);
      }
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    if (targetType === "SINGLE_EMPLOYEE" && !targetUserId) {
      toast.error("Please select an employee");
      return;
    }

    if (targetType === "SINGLE_BRANCH" && !targetBranchId) {
      toast.error("Please select a branch");
      return;
    }

    setSubmitting(true);

    const payload = {
      title,
      targetType,
      targetUserId: targetType === "SINGLE_EMPLOYEE" ? targetUserId : undefined,
      targetBranchId: targetType === "SINGLE_BRANCH" ? targetBranchId : undefined,
    };

    const result = editingNoticeId
      ? await updateBreakingNotice(editingNoticeId, payload)
      : await createBreakingNotice(payload);

    if (result.success) {
      toast.success(editingNoticeId ? "Notice updated. Employee timer has been reset." : "Notice created");
      resetForm();
      window.location.reload();
    } else {
      toast.error(result.error || "Failed to save notice");
    }

    setSubmitting(false);
  };

  const handleDelete = async (noticeId: string) => {
    const confirmed = window.confirm("Delete this notice? This will remove it from employee dashboards.");
    if (!confirmed) {
      return;
    }

    const result = await deleteBreakingNotice(noticeId);
    if (result.success) {
      toast.success("Notice deleted");
      window.location.reload();
      return;
    }

    toast.error(result.error || "Failed to delete notice");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            {panelTitle}
          </CardTitle>
          <CardDescription>{panelDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="notice-title">Title</Label>
                <Input
                  id="notice-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Notice title"
                  maxLength={160}
                />
              </div>

              <div className="space-y-2">
                <Label>Audience</Label>
                <Select
                  value={targetType}
                  onValueChange={(value) => {
                    setTargetType(value as TargetType);
                    setTargetUserId("");
                    setTargetUserSearch("");
                    setTargetBranchId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select target" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_EMPLOYEES">All employees</SelectItem>
                    <SelectItem value="SINGLE_EMPLOYEE">One employee</SelectItem>
                    <SelectItem value="SINGLE_BRANCH">One branch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {targetType === "SINGLE_EMPLOYEE" && (
              <div className="space-y-2">
                <Label>Employee</Label>
                <Input
                  value={targetUserSearch}
                  onChange={(event) => setTargetUserSearch(event.target.value)}
                  placeholder="Search by name or email"
                />
                <Select value={targetUserId} onValueChange={setTargetUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredEmployeeOptions.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.label}
                      </SelectItem>
                    ))}
                    {filteredEmployeeOptions.length === 0 && (
                      <div className="px-2 py-2 text-xs text-muted-foreground">No employee found</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {targetType === "SINGLE_BRANCH" && (
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={targetBranchId} onValueChange={setTargetBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={submitting}>
                {editingNoticeId ? <Save className="mr-2 h-4 w-4" /> : <Megaphone className="mr-2 h-4 w-4" />}
                {submitting ? "Saving..." : editingNoticeId ? "Update Notice" : "Create Notice"}
              </Button>

              {editingNoticeId && (
                <Button type="button" variant="outline" onClick={resetForm} disabled={submitting}>
                  Cancel Edit
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notice History</CardTitle>
          <CardDescription>
            View complete history including who has seen each notice and when.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notices created yet.</p>
          ) : (
            notices.map((notice) => {
              const seenCount = notice.recipients.filter((recipient) => recipient.status).length;
              const totalCount = notice.recipients.length;
              const isExpanded = expandedNoticeIds.has(notice.id);

              return (
                <div key={notice.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">{notice.title}</h3>
                        {notice.isEdited && <Badge variant="secondary">Edited</Badge>}
                        <Badge variant="outline">Version {notice.version}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <User2 className="h-3 w-3" />
                          By {getUserDisplayName(notice.sender)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Seen {seenCount}/{totalCount}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Updated {formatDate(notice.updatedAt)}
                        </span>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Target: {notice.targetType === "ALL_EMPLOYEES"
                          ? "All employees"
                          : notice.targetType === "SINGLE_EMPLOYEE"
                            ? notice.targetUser
                              ? getUserDisplayName(notice.targetUser)
                              : "Employee"
                            : notice.targetBranch?.name || "Branch"}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => toggleExpanded(notice.id)}>
                        <Eye className="mr-1 h-4 w-4" />
                        {isExpanded ? "Hide Seen Log" : "Show Seen Log"}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => loadIntoForm(notice)}>
                        <Edit className="mr-1 h-4 w-4" />
                        Edit
                      </Button>
                      <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(notice.id)}>
                        <Trash2 className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Branch</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Seen Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {notice.recipients.map((recipient) => (
                            <TableRow key={recipient.id}>
                              <TableCell>{getUserDisplayName(recipient.user)}</TableCell>
                              <TableCell>{recipient.user.branch?.name || "-"}</TableCell>
                              <TableCell>
                                {recipient.status ? <Badge>Seen</Badge> : <Badge variant="secondary">Unseen</Badge>}
                              </TableCell>
                              <TableCell>{formatDate(recipient.seenAt)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
