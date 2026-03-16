"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { User, Role } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { toast } from "sonner";
import { submitProfileUpdateRequest, updateUserProfileByAdmin } from "@/actions/profile.actions";
import { updateEmployeeProfile } from "@/actions/employee.actions";
import { getActiveDepartments } from "@/actions/department.actions";
import { getDesignationsByDepartment } from "@/actions/designation.actions";
import { getActiveLeaveTypes, getUserLeaveEntitlements, assignLeaveToUser, removeLeaveFromUser } from "@/actions/leave.actions";
import { getAllowanceTypes, getEmployeeAllowances, assignEmployeeAllowance, removeEmployeeAllowance } from "@/actions/settings.actions";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  User as UserIcon, 
  Briefcase, 
  Calendar,
  Clock,
  DollarSign,
  Plus,
  Minus
} from "lucide-react";

const profileFormSchema = z.object({
  // Personal Information
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  bloodGroup: z.string().optional(),
  nidNumber: z.string().optional(),

  // Contact Information
  phoneNumber: z.string().optional(),
  personalEmail: z.string().email().optional().or(z.literal("")),

  // Current Address
  currentStreet: z.string().optional(),
  currentCity: z.string().optional(),
  currentState: z.string().optional(),
  currentCountry: z.string().optional(),
  currentPostalCode: z.string().optional(),

  // Permanent Address
  permanentStreet: z.string().optional(),
  permanentCity: z.string().optional(),
  permanentState: z.string().optional(),
  permanentCountry: z.string().optional(),
  permanentPostalCode: z.string().optional(),

  // Employment Details
  dateOfJoining: z.string().optional(),
  attendanceId: z.string().optional(),
  workingDaysInMonth: z.string().optional(),

  // Emergency Contact
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactEmail: z.string().email().optional().or(z.literal("")),
  emergencyContactAddress: z.string().optional(),
  emergencyContactNid: z.string().optional(),

  // Nominee Details
  nomineeName: z.string().optional(),
  nomineeRelationship: z.string().optional(),
  nomineePhone: z.string().optional(),
  nomineeEmail: z.string().email().optional().or(z.literal("")),
  nomineeNid: z.string().optional(),
  nomineeAddress: z.string().optional(),

  // Banking Information
  bankAccountNumber: z.string().optional(),

  // Professional Links
  portfolioLink: z.string().url().optional().or(z.literal("")),
  githubLink: z.string().url().optional().or(z.literal("")),
  linkedinLink: z.string().url().optional().or(z.literal("")),

  // Employee Document Links
  loanPapersLink: z.string().url().optional().or(z.literal("")),
  nomineesPapersLink: z.string().url().optional().or(z.literal("")),
  emergencyContactLink: z.string().url().optional().or(z.literal("")),
  personalInfoLink: z.string().url().optional().or(z.literal("")),

  // Employment Details (Admin only)
  role: z.enum(["EMPLOYEE", "HR", "SUPERADMIN"]).optional(),
  branchId: z.string().optional(),
  departmentId: z.string().optional(),
  designationId: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

interface Branch {
  id: string;
  name: string;
  location: string;
}

interface Department {
  id: string;
  name: string;
}

interface Designation {
  id: string;
  name: string;
}

interface LeaveType {
  id: string;
  name: string;
  allocatedDays: number;
  requiresApproval: boolean;
  isActive: boolean;
}

interface UserLeaveEntitlement {
  id: string;
  year: number;
  allocatedDays: number;
  usedDays: number;
  leaveType: LeaveType;
}

interface ProfileEditFormProps {
  user: User & {
    branch?: { id: string; name: string; location: string } | null;
    department?: { id: string; name: string } | null;
    designation?: { id: string; name: string } | null;
  };
  branches?: Branch[];
  isAdmin?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ProfileEditFormTabbed({ user, branches = [], isAdmin = false, onSuccess, onCancel }: ProfileEditFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [userLeaveEntitlements, setUserLeaveEntitlements] = useState<UserLeaveEntitlement[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(
    user.departmentId || ""
  );
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState<string>("");
  const [customLeaveDays, setCustomLeaveDays] = useState<string>("");
  
  // Allowance Management State
  const [allowanceTypes, setAllowanceTypes] = useState<any[]>([]);
  const [userAllowances, setUserAllowances] = useState<any[]>([]);
  const [isAllowanceDialogOpen, setIsAllowanceDialogOpen] = useState(false);
  const [selectedAllowanceId, setSelectedAllowanceId] = useState<string>("");

  // Load departments, designations, leave types, and allowances for admin
  useEffect(() => {
    if (isAdmin) {
      const loadData = async () => {
        try {
          const [depts, leaveTypesData, allowanceTypesData] = await Promise.all([
            getActiveDepartments(),
            getActiveLeaveTypes(),
            getAllowanceTypes()
          ]);
          setDepartments(depts);
          setLeaveTypes(leaveTypesData);
          setAllowanceTypes(allowanceTypesData);
        } catch (error) {
          console.error("Failed to load reference data:", error);
        }
      };
      loadData();
    }
  }, [isAdmin]);

  // Load user leave entitlements
  useEffect(() => {
    const loadLeaveEntitlements = async () => {
      try {
        const entitlements = await getUserLeaveEntitlements(user.id);
        setUserLeaveEntitlements(entitlements);
      } catch (error) {
        console.error("Failed to load leave entitlements:", error);
      }
    };
    loadLeaveEntitlements();
  }, [user.id]);

  // Load user allowances
  useEffect(() => {
    const loadUserAllowances = async () => {
      try {
        const allowances = await getEmployeeAllowances(user.id);
        setUserAllowances(allowances);
      } catch (error) {
        console.error("Failed to load user allowances:", error);
      }
    };
    loadUserAllowances();
  }, [user.id]);

  useEffect(() => {
    if (isAdmin && selectedDepartmentId) {
      const loadDesignations = async () => {
        try {
          const desigs = await getDesignationsByDepartment(selectedDepartmentId);
          setDesignations(desigs);
        } catch (error) {
          console.error("Failed to load designations:", error);
        }
      };
      loadDesignations();
    } else {
      setDesignations([]);
    }
  }, [selectedDepartmentId, isAdmin]);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      gender: user.gender || "",
      dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split("T")[0] : "",
      bloodGroup: user.bloodGroup || "",
      nidNumber: user.nidNumber || "",
      phoneNumber: user.phoneNumber || "",
      personalEmail: user.personalEmail || "",
      currentStreet: user.currentStreet || "",
      currentCity: user.currentCity || "",
      currentState: user.currentState || "",
      currentCountry: user.currentCountry || "",
      currentPostalCode: user.currentPostalCode || "",
      permanentStreet: user.permanentStreet || "",
      permanentCity: user.permanentCity || "",
      permanentState: user.permanentState || "",
      permanentCountry: user.permanentCountry || "",
      permanentPostalCode: user.permanentPostalCode || "",
      dateOfJoining: user.dateOfJoining ? new Date(user.dateOfJoining).toISOString().split("T")[0] : "",
      attendanceId: user.attendanceId || "",
      workingDaysInMonth: user.workingDaysInMonth?.toString() || "",
      emergencyContactName: user.emergencyContactName || "",
      emergencyContactRelationship: user.emergencyContactRelationship || "",
      emergencyContactPhone: user.emergencyContactPhone || "",
      emergencyContactEmail: user.emergencyContactEmail || "",
      emergencyContactAddress: user.emergencyContactAddress || "",
      emergencyContactNid: user.emergencyContactNid || "",
      nomineeName: user.nomineeName || "",
      nomineeRelationship: user.nomineeRelationship || "",
      nomineePhone: user.nomineePhone || "",
      nomineeEmail: user.nomineeEmail || "",
      nomineeNid: user.nomineeNid || "",
      nomineeAddress: user.nomineeAddress || "",
      bankAccountNumber: user.bankAccountNumber || "",
      portfolioLink: user.portfolioLink || "",
      githubLink: user.githubLink || "",
      linkedinLink: user.linkedinLink || "",
      loanPapersLink: user.loanPapersLink || "",
      nomineesPapersLink: user.nomineesPapersLink || "",
      emergencyContactLink: user.emergencyContactLink || "",
      personalInfoLink: user.personalInfoLink || "",
      // Employment details
      role: user.role || "EMPLOYEE",
      branchId: user.branchId || "",
      departmentId: user.departmentId || "",
      designationId: user.designationId || "",
    },
  });

  async function onSubmit(data: ProfileFormValues) {
    setIsSubmitting(true);
    try {
      const workingDaysRaw = data.workingDaysInMonth?.trim();
      let workingDaysValue: number | null | undefined = undefined;

      if (isAdmin) {
        if (!workingDaysRaw) {
          workingDaysValue = null;
        } else {
          const parsed = Number(workingDaysRaw);
          if (!Number.isInteger(parsed) || parsed < 0 || parsed > 31) {
            toast.error("Working days must be a whole number between 0 and 31");
            setIsSubmitting(false);
            return;
          }
          workingDaysValue = parsed;
        }
      }

      // Convert date strings to Date objects and construct proper data object
      const finalFormattedData = {
        // Personal Information
        gender: data.gender || null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        bloodGroup: data.bloodGroup || null,
        nidNumber: data.nidNumber || null,

        // Contact Information
        phoneNumber: data.phoneNumber || null,
        personalEmail: data.personalEmail || null,

        // Current Address
        currentStreet: data.currentStreet || null,
        currentCity: data.currentCity || null,
        currentState: data.currentState || null,
        currentCountry: data.currentCountry || null,
        currentPostalCode: data.currentPostalCode || null,

        // Permanent Address
        permanentStreet: data.permanentStreet || null,
        permanentCity: data.permanentCity || null,
        permanentState: data.permanentState || null,
        permanentCountry: data.permanentCountry || null,
        permanentPostalCode: data.permanentPostalCode || null,

        // Employment Details
        dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining) : null,
        attendanceId: data.attendanceId || null,
        ...(isAdmin ? { workingDaysInMonth: workingDaysValue } : {}),

        // Emergency Contact
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactRelationship: data.emergencyContactRelationship || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        emergencyContactEmail: data.emergencyContactEmail || null,
        emergencyContactAddress: data.emergencyContactAddress || null,
        emergencyContactNid: data.emergencyContactNid || null,

        // Nominee Details
        nomineeName: data.nomineeName || null,
        nomineeRelationship: data.nomineeRelationship || null,
        nomineePhone: data.nomineePhone || null,
        nomineeEmail: data.nomineeEmail || null,
        nomineeNid: data.nomineeNid || null,
        nomineeAddress: data.nomineeAddress || null,

        // Banking Information
        bankAccountNumber: data.bankAccountNumber || null,

        // Professional Links
        portfolioLink: data.portfolioLink || null,
        githubLink: data.githubLink || null,
        linkedinLink: data.linkedinLink || null,
        loanPapersLink: data.loanPapersLink || null,
        nomineesPapersLink: data.nomineesPapersLink || null,
        emergencyContactLink: data.emergencyContactLink || null,
        personalInfoLink: data.personalInfoLink || null,
      };

      let result;
      if (isAdmin) {
        // Admin can update profile and employment details
        const profileResult = await updateUserProfileByAdmin(user.id, finalFormattedData);
        
        // Update employment details if any have changed
        if (data.role || data.branchId || data.departmentId || data.designationId) {
          const employmentData = {
            role: data.role as Role,
            branchId: data.branchId || null,
            departmentId: data.departmentId || null,
            designationId: data.designationId || null,
          };
          const employmentResult = await updateEmployeeProfile(user.id, employmentData);
          
          if (!employmentResult.success) {
            toast.error(employmentResult.error || "Failed to update employment details");
            setIsSubmitting(false);
            return;
          }
        }
        result = profileResult;
      } else {
        // Employee submits update request
        result = await submitProfileUpdateRequest(finalFormattedData);
      }

      if (result.success) {
        toast.success(
          isAdmin
            ? "Profile updated successfully"
            : "Profile update request submitted. Awaiting admin approval."
        );
        if (onSuccess) onSuccess();
      } else {
        toast.error(result.error || "Failed to update profile");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Leave management functions
  const handleAssignLeave = async (leaveTypeId: string, customDays?: number) => {
    try {
      const result = await assignLeaveToUser(user.id, leaveTypeId, customDays);
      if (result.success) {
        toast.success("Leave type assigned successfully");
        // Reload leave entitlements
        const entitlements = await getUserLeaveEntitlements(user.id);
        setUserLeaveEntitlements(entitlements);
        setIsLeaveDialogOpen(false);
        setSelectedLeaveTypeId("");
        setCustomLeaveDays("");
      } else {
        toast.error(result.error || "Failed to assign leave type");
      }
    } catch (error) {
      console.error("Error assigning leave:", error);
      toast.error("Failed to assign leave type");
    }
  };

  const handleRemoveLeave = async (leaveTypeId: string) => {
    try {
      const result = await removeLeaveFromUser(user.id, leaveTypeId);
      if (result.success) {
        toast.success("Leave type removed successfully");
        // Reload leave entitlements
        const entitlements = await getUserLeaveEntitlements(user.id);
        setUserLeaveEntitlements(entitlements);
      } else {
        toast.error(result.error || "Failed to remove leave type");
      }
    } catch (error) {
      console.error("Error removing leave:", error);
      toast.error("Failed to remove leave type");
    }
  };

  const handleUpdateLeaveAllocation = async (leaveTypeId: string, newDays: number) => {
    await handleAssignLeave(leaveTypeId, newDays);
  };

  // Allowance management functions
  const handleAssignAllowance = async (allowanceId: string) => {
    try {
      const result = await assignEmployeeAllowance(user.id, allowanceId);
      if (result.success) {
        toast.success("Allowance assigned successfully");
        // Reload user allowances
        const allowances = await getEmployeeAllowances(user.id);
        setUserAllowances(allowances);
        setIsAllowanceDialogOpen(false);
        setSelectedAllowanceId("");
      } else {
        toast.error(result.error || "Failed to assign allowance");
      }
    } catch (error) {
      console.error("Error assigning allowance:", error);
      toast.error("Failed to assign allowance");
    }
  };

  const handleRemoveAllowance = async (allowanceId: string) => {
    try {
      const result = await removeEmployeeAllowance(user.id, allowanceId);
      if (result.success) {
        toast.success("Allowance removed successfully");
        // Reload user allowances
        const allowances = await getEmployeeAllowances(user.id);
        setUserAllowances(allowances);
      } else {
        toast.error(result.error || "Failed to remove allowance");
      }
    } catch (error) {
      console.error("Error removing allowance:", error);
      toast.error("Failed to remove allowance");
    }
  };

  const handleAddAllowance = () => {
    if (!selectedAllowanceId) {
      toast.error("Please select an allowance type");
      return;
    }
    
    handleAssignAllowance(selectedAllowanceId);
  };

  const handleAddLeaveType = () => {
    if (!selectedLeaveTypeId) {
      toast.error("Please select a leave type");
      return;
    }
    
    let customDaysNumber: number | undefined = undefined;
    if (customLeaveDays) {
      const parsedDays = parseInt(customLeaveDays);
      if (isNaN(parsedDays) || parsedDays < 0) {
        toast.error("Please enter a valid number of days");
        return;
      }
      customDaysNumber = parsedDays;
    }
    
    handleAssignLeave(selectedLeaveTypeId, customDaysNumber);
  };

  // Get available leave types (not yet assigned to user)
  const availableLeaveTypes = leaveTypes.filter(
    leaveType => !userLeaveEntitlements.some(
      entitlement => entitlement.leaveType.id === leaveType.id
    )
  );

  // Get available allowance types (not yet assigned to user and active)
  const availableAllowanceTypes = allowanceTypes.filter(
    allowanceType => allowanceType.isActive && !userAllowances.some(
      userAllowance => userAllowance.allowanceId === allowanceType.id && userAllowance.isActive
    )
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="personal" className="flex items-center gap-2">
              <UserIcon className="h-4 w-4" />
              Personal Info
            </TabsTrigger>
            <TabsTrigger value="employment" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Employment
            </TabsTrigger>
            <TabsTrigger value="leave-allowance" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Leave & Allowance
            </TabsTrigger>
          </TabsList>

          {/* Personal Info Tab */}
          <TabsContent value="personal" className="space-y-6">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Update your personal details</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                          <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bloodGroup"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Blood Group</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select blood group" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="A+">A+</SelectItem>
                          <SelectItem value="A-">A-</SelectItem>
                          <SelectItem value="B+">B+</SelectItem>
                          <SelectItem value="B-">B-</SelectItem>
                          <SelectItem value="AB+">AB+</SelectItem>
                          <SelectItem value="AB-">AB-</SelectItem>
                          <SelectItem value="O+">O+</SelectItem>
                          <SelectItem value="O-">O-</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nidNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NID Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter NID number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+1234567890" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="personalEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Personal Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="personal@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Address Information */}
            <Card>
              <CardHeader>
                <CardTitle>Address Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Current Address */}
                <div className="space-y-4">
                  <h4 className="font-medium">Current Address</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="currentStreet"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Street Address</FormLabel>
                          <FormControl>
                            <Input placeholder="Street address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="currentCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="City" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="currentState"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State/Province</FormLabel>
                          <FormControl>
                            <Input placeholder="State or Province" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="currentCountry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country</FormLabel>
                          <FormControl>
                            <Input placeholder="Country" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="currentPostalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Postal Code</FormLabel>
                          <FormControl>
                            <Input placeholder="Postal code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Permanent Address */}
                <div className="space-y-4">
                  <h4 className="font-medium">Permanent Address</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="permanentStreet"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Street Address</FormLabel>
                          <FormControl>
                            <Input placeholder="Street address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="permanentCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="City" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="permanentState"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State/Province</FormLabel>
                          <FormControl>
                            <Input placeholder="State or Province" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="permanentCountry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country</FormLabel>
                          <FormControl>
                            <Input placeholder="Country" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="permanentPostalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Postal Code</FormLabel>
                          <FormControl>
                            <Input placeholder="Postal code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Emergency Contact */}
            <Card>
              <CardHeader>
                <CardTitle>Emergency Contact</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="emergencyContactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Emergency contact name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emergencyContactRelationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Father, Mother, Spouse" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emergencyContactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+1234567890" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emergencyContactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (Optional)</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="emergency@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emergencyContactAddress"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="Emergency contact address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emergencyContactNid"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NID Number</FormLabel>
                      <FormControl>
                        <Input placeholder="National ID number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Professional Links */}
            <Card>
              <CardHeader>
                <CardTitle>Professional Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="portfolioLink"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Portfolio</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="https://myportfolio.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="githubLink"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GitHub</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="https://github.com/username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="linkedinLink"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>LinkedIn</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="https://linkedin.com/in/username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Employment Details Tab */}
          <TabsContent value="employment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Employment Information</CardTitle>
                <CardDescription>
                  {isAdmin 
                    ? "Update employment details and organizational assignment" 
                    : "View your employment information"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="dateOfJoining"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of Joining</FormLabel>
                        <FormControl>
                          <Input type="date" disabled={!isAdmin} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="attendanceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Attendance ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Employee ID for attendance" disabled={!isAdmin} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {isAdmin && (
                    <FormField
                      control={form.control}
                      name="workingDaysInMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Working Days in Month</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="0" 
                              max="31" 
                              placeholder="22" 
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription>Number of working days per month (0-31)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {/* Admin-only employment details */}
                {isAdmin && (
                  <div className="space-y-4 border-t pt-6">
                    <h4 className="font-medium">Organizational Assignment</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Role</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="EMPLOYEE">Employee</SelectItem>
                                <SelectItem value="HR">HR</SelectItem>
                                <SelectItem value="SUPERADMIN">Super Admin</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="branchId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Branch</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select branch (optional)" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {branches.map((branch) => (
                                  <SelectItem key={branch.id} value={branch.id}>
                                    {branch.name} - {branch.location}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="departmentId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Department</FormLabel>
                            <Select 
                              onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedDepartmentId(value);
                                // Clear designation when department changes
                                form.setValue("designationId", "");
                              }}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select department (optional)" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {departments.map((dept) => (
                                  <SelectItem key={dept.id} value={dept.id}>
                                    {dept.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="designationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Designation</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value}
                              disabled={!selectedDepartmentId}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select designation (optional)" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {designations.map((designation) => (
                                  <SelectItem key={designation.id} value={designation.id}>
                                    {designation.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!selectedDepartmentId && (
                              <FormDescription>Select a department first</FormDescription>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {isAdmin && (
                  <div className="space-y-4 border-t pt-6">
                    <h4 className="font-medium">Employee Document Links</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="loanPapersLink"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Loan Papers Link</FormLabel>
                            <FormControl>
                              <Input type="url" placeholder="https://..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="nomineesPapersLink"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nominees Papers Link</FormLabel>
                            <FormControl>
                              <Input type="url" placeholder="https://..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="emergencyContactLink"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Emergency Contact Link</FormLabel>
                            <FormControl>
                              <Input type="url" placeholder="https://..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="personalInfoLink"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Personal Info Link</FormLabel>
                            <FormControl>
                              <Input type="url" placeholder="https://..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {/* Display current employment info for non-admin users */}
                {!isAdmin && (
                  <div className="space-y-4 border-t pt-6">
                    <h4 className="font-medium">Current Assignment</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Role</label>
                        <Badge variant="secondary">{user.role}</Badge>
                      </div>
                      
                      {user.branch && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Branch</label>
                          <p className="text-sm text-muted-foreground">{user.branch.name} - {user.branch.location}</p>
                        </div>
                      )}
                      
                      {user.department && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Department</label>
                          <p className="text-sm text-muted-foreground">{user.department.name}</p>
                        </div>
                      )}
                      
                      {user.designation && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Designation</label>
                          <p className="text-sm text-muted-foreground">{user.designation.name}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Nominee Details */}
            <Card>
              <CardHeader>
                <CardTitle>Nominee Details</CardTitle>
                <CardDescription>Person who will receive benefits in case of emergency</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nomineeName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Nominee name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nomineeRelationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Father, Mother, Spouse, Child" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nomineePhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+1234567890" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nomineeEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (Optional)</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="nominee@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nomineeNid"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NID Number</FormLabel>
                      <FormControl>
                        <Input placeholder="National ID number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nomineeAddress"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="Nominee's complete address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Banking Information */}
            <Card>
              <CardHeader>
                <CardTitle>Banking Information</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="bankAccountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Account Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Account number" {...field} />
                      </FormControl>
                      <FormDescription>This information is kept confidential</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leave & Allowance Management Tab */}
          <TabsContent value="leave-allowance" className="space-y-6">
            {/* Leave Management */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Leave Management
                  </CardTitle>
                  <CardDescription>
                    {isAdmin ? "Manage leave types and allocations for this employee" : "View your leave entitlements"}
                  </CardDescription>
                </div>
                {isAdmin && (
                  <Dialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Leave Type
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Assign Leave Type</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Leave Type</label>
                          <Select value={selectedLeaveTypeId} onValueChange={setSelectedLeaveTypeId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a leave type" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableLeaveTypes.map(leaveType => (
                                <SelectItem key={leaveType.id} value={leaveType.id}>
                                  {leaveType.name} ({leaveType.allocatedDays} days default)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Custom Allocation (Optional)</label>
                          <Input
                            type="number"
                            placeholder="Leave empty to use default allocation"
                            value={customLeaveDays}
                            onChange={(e) => setCustomLeaveDays(e.target.value)}
                          />
                          {selectedLeaveTypeId && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Default: {leaveTypes.find(lt => lt.id === selectedLeaveTypeId)?.allocatedDays || 0} days
                            </p>
                          )}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setIsLeaveDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleAddLeaveType}>
                            Assign Leave Type
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent>
                {userLeaveEntitlements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-sm font-medium">No Leave Types Assigned</p>
                    <p className="text-xs">
                      {isAdmin 
                        ? "Click 'Add Leave Type' to assign leave types to this employee"
                        : "Contact your admin to get leave types assigned"
                      }
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Leave Type</TableHead>
                        <TableHead>Allocated Days</TableHead>
                        <TableHead>Used Days</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead>Requires Approval</TableHead>
                        {isAdmin && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userLeaveEntitlements.map((entitlement) => (
                        <TableRow key={entitlement.id}>
                          <TableCell className="font-medium">
                            {entitlement.leaveType.name}
                          </TableCell>
                          <TableCell>
                            {isAdmin ? (
                              <Input
                                type="number"
                                value={entitlement.allocatedDays}
                                onChange={(e) => {
                                  const newDays = parseInt(e.target.value);
                                  if (!isNaN(newDays) && newDays >= 0) {
                                    handleUpdateLeaveAllocation(entitlement.leaveType.id, newDays);
                                  }
                                }}
                                className="w-20"
                                min="0"
                              />
                            ) : (
                              entitlement.allocatedDays
                            )}
                          </TableCell>
                          <TableCell>{entitlement.usedDays}</TableCell>
                          <TableCell>
                            <Badge variant={entitlement.allocatedDays - entitlement.usedDays <= 0 ? "destructive" : "secondary"}>
                              {entitlement.allocatedDays - entitlement.usedDays}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={entitlement.leaveType.requiresApproval ? "default" : "secondary"}>
                              {entitlement.leaveType.requiresApproval ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRemoveLeave(entitlement.leaveType.id)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Allowance Management */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Allowance Management
                  </CardTitle>
                  <CardDescription>
                    {isAdmin ? "Manage allowances for this employee" : "View your assigned allowances"}
                  </CardDescription>
                </div>
                {isAdmin && (
                  <Dialog open={isAllowanceDialogOpen} onOpenChange={setIsAllowanceDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Allowance
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Assign Allowance</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Allowance Type</label>
                          <Select value={selectedAllowanceId} onValueChange={setSelectedAllowanceId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select an allowance type" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableAllowanceTypes.map(allowanceType => (
                                <SelectItem key={allowanceType.id} value={allowanceType.id}>
                                  {allowanceType.name} - {allowanceType.valueType === 'PERCENTAGE' ? `${allowanceType.amount}%` : `$${allowanceType.amount}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setIsAllowanceDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleAddAllowance}>
                            Assign Allowance
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent>
                {userAllowances.filter(allowance => allowance.isActive).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <DollarSign className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-sm font-medium">No Allowances Assigned</p>
                    <p className="text-xs">
                      {isAdmin 
                        ? "Click 'Add Allowance' to assign allowances to this employee"
                        : "Contact your admin to get allowances assigned"
                      }
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Allowance Name</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Status</TableHead>
                        {isAdmin && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userAllowances.filter(userAllowance => userAllowance.isActive).map((userAllowance) => (
                        <TableRow key={userAllowance.id}>
                          <TableCell className="font-medium">
                            {userAllowance.allowance.name}
                          </TableCell>
                          <TableCell>
                            {userAllowance.allowance.valueType === 'PERCENTAGE' 
                              ? `${userAllowance.allowance.amount}%` 
                              : `$${userAllowance.allowance.amount}`
                            }
                          </TableCell>
                          <TableCell>
                            <Badge variant={userAllowance.allowance.valueType === 'PERCENTAGE' ? "default" : "secondary"}>
                              {userAllowance.allowance.valueType === 'PERCENTAGE' ? "Percentage" : "Fixed"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {userAllowance.allowance.scope}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="default">
                              Active
                            </Badge>
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRemoveAllowance(userAllowance.allowanceId)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Form Action Buttons */}
          <div className="flex justify-end gap-4 pt-6 border-t">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isAdmin ? "Update Profile" : "Submit for Approval"}
            </Button>
          </div>
        </Tabs>
      </form>
    </Form>
  );
}