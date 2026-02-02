"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getAllDepartments,
  createDepartment,
  updateDepartment,
  toggleDepartmentStatus,
  deleteDepartment,
} from "@/actions/department.actions";

interface Department {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  parentId: string | null;
  parent: { id: string; name: string } | null;
  children: unknown[];
  _count: {
    designations: number;
    users: number;
  };
}

interface DepartmentClientProps {
  initialDepartments?: Department[];
}

export function DepartmentClient({ initialDepartments = [] }: DepartmentClientProps) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    parentId: null as string | null,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (showInactive) {
      loadDepartments();
    } else {
      // Filter initial data when hiding inactive
      setDepartments(initialDepartments.filter((d: Department) => d.isActive));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  const loadDepartments = async () => {
    setLoading(true);
    try {
      const data = await getAllDepartments(showInactive);
      setDepartments(data);
    } catch {
      toast.error("Failed to load departments");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (department?: Department) => {
    if (department) {
      setEditingDepartment(department);
      setFormData({
        name: department.name,
        description: department.description || "",
        parentId: department.parentId,
      });
    } else {
      setEditingDepartment(null);
      setFormData({ name: "", description: "", parentId: null });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingDepartment(null);
    setFormData({ name: "", description: "", parentId: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const result = editingDepartment
        ? await updateDepartment(editingDepartment.id, {
            name: formData.name,
            description: formData.description || undefined,
            parentId: formData.parentId || null,
          })
        : await createDepartment({
            name: formData.name,
            description: formData.description || undefined,
            parentId: formData.parentId || undefined,
          });

      if (result.success) {
        toast.success(
          editingDepartment
            ? "Department updated successfully"
            : "Department created successfully"
        );
        handleCloseDialog();
        loadDepartments();
      } else {
        toast.error(result.error || "Operation failed");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: string) => {
    const result = await toggleDepartmentStatus(id);
    if (result.success) {
      toast.success("Department status updated");
      loadDepartments();
    } else {
      toast.error(result.error || "Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this department?")) return;

    const result = await deleteDepartment(id);
    if (result.success) {
      toast.success("Department deleted successfully");
      loadDepartments();
    } else {
      toast.error(result.error || "Failed to delete department");
    }
  };

  const getAvailableParents = () => {
    return departments.filter(
      (d) =>
        d.isActive &&
        d.id !== editingDepartment?.id && // Can't be its own parent
        !isDescendantOf(d.id, editingDepartment?.id || "") // Can't select a child as parent
    );
  };

  const isDescendantOf = (departmentId: string, ancestorId: string): boolean => {
    const dept = departments.find((d) => d.id === departmentId);
    if (!dept) return false;
    if (dept.parentId === ancestorId) return true;
    if (dept.parentId) return isDescendantOf(dept.parentId, ancestorId);
    return false;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Department Management</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInactive(!showInactive)}
            >
              {showInactive ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
              {showInactive ? "Hide Inactive" : "Show Inactive"}
            </Button>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Department
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : departments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No departments found. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Parent Department</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Designations</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((dept) => (
                  <TableRow key={dept.id}>
                    <TableCell className="font-medium">{dept.name}</TableCell>
                    <TableCell>
                      {dept.parent ? (
                        <span className="text-sm text-muted-foreground">
                          {dept.parent.name}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {dept.description || "-"}
                      </span>
                    </TableCell>
                    <TableCell>{dept._count.designations}</TableCell>
                    <TableCell>{dept._count.users}</TableCell>
                    <TableCell>
                      <Badge variant={dept.isActive ? "default" : "secondary"}>
                        {dept.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(dept)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(dept.id)}
                        >
                          {dept.isActive ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(dept.id)}
                          disabled={dept._count.users > 0 || dept._count.designations > 0}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-125">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingDepartment ? "Edit Department" : "Add Department"}
              </DialogTitle>
              <DialogDescription>
                {editingDepartment
                  ? "Update the department details below."
                  : "Create a new department for your organization."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Department Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Sales, Engineering"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parentId">Parent Department</Label>
                <Select
                  value={formData.parentId || "none"}
                  onValueChange={(value) => setFormData({ ...formData, parentId: value === "none" ? null : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None (Top Level)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Top Level)</SelectItem>
                    {getAvailableParents().map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Brief description of the department"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingDepartment ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
