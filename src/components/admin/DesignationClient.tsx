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
  getAllDesignations,
  createDesignation,
  updateDesignation,
  toggleDesignationStatus,
  deleteDesignation,
} from "@/actions/designation.actions";
import { getActiveDepartments } from "@/actions/department.actions";

interface Designation {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  departmentId: string;
  department: {
    id: string;
    name: string;
    isActive: boolean;
  };
  _count: {
    users: number;
  };
}

interface Department {
  id: string;
  name: string;
}

export default function DesignationClient() {
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDesignation, setEditingDesignation] = useState<Designation | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    departmentId: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [showInactive]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [designationsData, departmentsData] = await Promise.all([
        getAllDesignations(showInactive),
        getActiveDepartments(),
      ]);
      setDesignations(designationsData);
      setDepartments(departmentsData);
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (designation?: Designation) => {
    if (designation) {
      setEditingDesignation(designation);
      setFormData({
        name: designation.name,
        description: designation.description || "",
        departmentId: designation.departmentId,
      });
    } else {
      setEditingDesignation(null);
      setFormData({ name: "", description: "", departmentId: "" });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingDesignation(null);
    setFormData({ name: "", description: "", departmentId: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.departmentId) {
      toast.error("Please select a department");
      return;
    }

    setSubmitting(true);

    try {
      const result = editingDesignation
        ? await updateDesignation(editingDesignation.id, {
            name: formData.name,
            description: formData.description || undefined,
            departmentId: formData.departmentId,
          })
        : await createDesignation({
            name: formData.name,
            description: formData.description || undefined,
            departmentId: formData.departmentId,
          });

      if (result.success) {
        toast.success(
          editingDesignation
            ? "Designation updated successfully"
            : "Designation created successfully"
        );
        handleCloseDialog();
        loadData();
      } else {
        toast.error(result.error || "Operation failed");
      }
    } catch (error) {
      toast.error("An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: string) => {
    const result = await toggleDesignationStatus(id);
    if (result.success) {
      toast.success("Designation status updated");
      loadData();
    } else {
      toast.error(result.error || "Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this designation?")) return;

    const result = await deleteDesignation(id);
    if (result.success) {
      toast.success("Designation deleted successfully");
      loadData();
    } else {
      toast.error(result.error || "Failed to delete designation");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Designation Management</CardTitle>
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
              Add Designation
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : designations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No designations found. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {designations.map((designation) => (
                  <TableRow key={designation.id}>
                    <TableCell className="font-medium">{designation.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{designation.department.name}</span>
                        {!designation.department.isActive && (
                          <Badge variant="secondary" className="text-xs">
                            Dept Inactive
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {designation.description || "-"}
                      </span>
                    </TableCell>
                    <TableCell>{designation._count.users}</TableCell>
                    <TableCell>
                      <Badge variant={designation.isActive ? "default" : "secondary"}>
                        {designation.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(designation)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(designation.id)}
                        >
                          {designation.isActive ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(designation.id)}
                          disabled={designation._count.users > 0}
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
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingDesignation ? "Edit Designation" : "Add Designation"}
              </DialogTitle>
              <DialogDescription>
                {editingDesignation
                  ? "Update the designation details below."
                  : "Create a new designation under a department."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="departmentId">Department *</Label>
                <Select
                  value={formData.departmentId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, departmentId: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Designation Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Manager, Developer"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Brief description of the designation"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingDesignation ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
