"use client";

import { useState } from "react";
import { createPublicHoliday, updatePublicHoliday, deletePublicHoliday } from "@/actions/leave.actions";
import { toast } from "sonner";
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
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit, Trash2, Calendar } from "lucide-react";

interface PublicHoliday {
    id: string;
    name: string;
    date: Date;
    description: string | null;
    isRecurring: boolean;
    isActive: boolean;
}

interface HolidayManagementProps {
    holidays: PublicHoliday[];
    currentYear: number;
}

export function HolidayManagement({ holidays: initialHolidays, currentYear }: HolidayManagementProps) {
    const [holidays, setHolidays] = useState(initialHolidays);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [editingHoliday, setEditingHoliday] = useState<PublicHoliday | null>(null);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        date: "",
        description: "",
        isRecurring: false
    });

    const resetForm = () => {
        setFormData({
            name: "",
            date: "",
            description: "",
            isRecurring: false
        });
        setEditingHoliday(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name || !formData.date) {
            toast.error("Please fill in required fields");
            return;
        }

        setLoading(true);
        
        try {
            let result;
            
            if (editingHoliday) {
                result = await updatePublicHoliday(editingHoliday.id, {
                    name: formData.name,
                    date: formData.date,
                    description: formData.description || undefined,
                    isRecurring: formData.isRecurring
                });
            } else {
                result = await createPublicHoliday({
                    name: formData.name,
                    date: formData.date,
                    description: formData.description || undefined,
                    isRecurring: formData.isRecurring
                });
            }
            
            if (result.success) {
                toast.success(editingHoliday ? "Holiday updated successfully" : "Holiday created successfully");
                setIsAddOpen(false);
                resetForm();
                
                // Refresh the page to show updated data
                window.location.reload();
            } else {
                toast.error(result.error || "Failed to save holiday");
            }
        } catch {
            toast.error("An error occurred while saving holiday");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete "${name}"?`)) {
            return;
        }

        try {
            const result = await deletePublicHoliday(id);
            
            if (result.success) {
                toast.success("Holiday deleted successfully");
                setHolidays(holidays.filter(h => h.id !== id));
            } else {
                toast.error(result.error || "Failed to delete holiday");
            }
        } catch {
            toast.error("An error occurred while deleting holiday");
        }
    };

    const handleEdit = (holiday: PublicHoliday) => {
        setEditingHoliday(holiday);
        setFormData({
            name: holiday.name,
            date: holiday.date.toISOString().split('T')[0],
            description: holiday.description || "",
            isRecurring: holiday.isRecurring
        });
        setIsAddOpen(true);
    };

    const formatDate = (date: Date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Public Holidays ({currentYear})</CardTitle>
                            <CardDescription>
                                Manage public holidays that prevent leave applications
                            </CardDescription>
                        </div>
                        
                        <Dialog open={isAddOpen} onOpenChange={(open) => {
                            setIsAddOpen(open);
                            if (!open) resetForm();
                        }}>
                            <DialogTrigger asChild>
                                <Button>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Holiday
                                </Button>
                            </DialogTrigger>
                            
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle>
                                        {editingHoliday ? "Edit Holiday" : "Add Holiday"}
                                    </DialogTitle>
                                </DialogHeader>
                                
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="name">Holiday Name*</Label>
                                        <Input
                                            id="name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g., New Year's Day"
                                            required
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="date">Date*</Label>
                                        <Input
                                            id="date"
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="description">Description</Label>
                                        <Textarea
                                            id="description"
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Optional description"
                                            rows={3}
                                        />
                                    </div>

                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="isRecurring"
                                            checked={formData.isRecurring}
                                            onCheckedChange={(checked) => 
                                                setFormData({ ...formData, isRecurring: !!checked })
                                            }
                                        />
                                        <Label htmlFor="isRecurring">Recurring annually</Label>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-4">
                                        <Button 
                                            type="button" 
                                            variant="outline" 
                                            onClick={() => setIsAddOpen(false)}
                                            disabled={loading}
                                        >
                                            Cancel
                                        </Button>
                                        <Button type="submit" disabled={loading}>
                                            {loading ? "Saving..." : editingHoliday ? "Update" : "Create"}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardHeader>
                
                <CardContent>
                    {holidays.length === 0 ? (
                        <div className="text-center py-8">
                            <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold">No holidays configured</h3>
                            <p className="text-muted-foreground mb-4">
                                Add public holidays to prevent leave applications on those dates.
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {holidays.map((holiday) => (
                                    <TableRow key={holiday.id}>
                                        <TableCell className="font-medium">
                                            {holiday.name}
                                        </TableCell>
                                        <TableCell>
                                            {formatDate(holiday.date)}
                                        </TableCell>
                                        <TableCell>
                                            {holiday.description || (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={holiday.isRecurring ? "default" : "secondary"}>
                                                {holiday.isRecurring ? "Annual" : "One-time"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleEdit(holiday)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleDelete(holiday.id, holiday.name)}
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
        </div>
    );
}