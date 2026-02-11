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
import { toast } from "sonner";
import { submitProfileUpdateRequest, updateUserProfileByAdmin } from "@/actions/profile.actions";
import { updateEmployeeProfile } from "@/actions/employee.actions";
import { getActiveDepartments } from "@/actions/department.actions";
import { getDesignationsByDepartment } from "@/actions/designation.actions";
import { Loader2, UserCog, CalendarDays, DollarSign, User as UserIcon, Briefcase, Calendar } from "lucide-react";

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

  // Banking Information
  bankAccountNumber: z.string().optional(),

  // Professional Links
  portfolioLink: z.string().url().optional().or(z.literal("")),
  githubLink: z.string().url().optional().or(z.literal("")),
  linkedinLink: z.string().url().optional().or(z.literal("")),

  // Employment Details (Admin only)
  role: z.enum(["SUPERADMIN", "HR", "MANAGER", "EMPLOYEE"]).optional(),
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

export function ProfileEditForm({ user, branches = [], isAdmin = false, onSuccess, onCancel }: ProfileEditFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(
    user.departmentId || ""
  );

  // Load departments and designations for admin
  useEffect(() => {
    if (isAdmin) {
      const loadDepartments = async () => {
        try {
          const depts = await getActiveDepartments();
          setDepartments(depts);
        } catch (error) {
          console.error("Failed to load departments:", error);
        }
      };
      loadDepartments();
    }
  }, [isAdmin]);

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
      bankAccountNumber: user.bankAccountNumber || "",
      portfolioLink: user.portfolioLink || "",
      githubLink: user.githubLink || "",
      linkedinLink: user.linkedinLink || "",
      // Employment details
      role: user.role as Role,
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

      // Convert date strings to Date objects
      const { workingDaysInMonth, role, branchId, departmentId, designationId, ...rest } = data;
      const formattedData = {
        ...rest,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining) : null,
        ...(isAdmin ? { workingDaysInMonth: workingDaysValue } : {}),
      };

      let result;
      if (isAdmin) {
        // Admin can update profile and employment details
        const profileResult = await updateUserProfileByAdmin(user.id, formattedData);
        
        // Update employment details if any have changed
        if (role || branchId || departmentId || designationId) {
          const employmentData = {
            role: role as Role,
            branchId: branchId || null,
            departmentId: departmentId || null,
            designationId: designationId || null,
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
        result = await submitProfileUpdateRequest(formattedData);
      }

      if (result.success) {
        toast.success(
          isAdmin
            ? "Profile updated successfully"
            : "Profile update request submitted. Awaiting admin approval."
        );
        onSuccess?.();
      } else {
        toast.error(result.error || "Failed to update profile");
      }
    } catch (error) {
      toast.error("An error occurred while updating profile");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }

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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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

        {/* Current Address */}
        <Card>
          <CardHeader>
            <CardTitle>Current Address</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="currentStreet"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St, Apt 4B" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                    <Input placeholder="State" {...field} />
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
                    <Input placeholder="12345" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Permanent Address */}
        <Card>
          <CardHeader>
            <CardTitle>Permanent Address</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="permanentStreet"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St, Apt 4B" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                    <Input placeholder="State" {...field} />
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
                    <Input placeholder="12345" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card>
          <CardHeader>
            <CardTitle>Employment Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dateOfJoining"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of Joining</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
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
                    <Input placeholder="EMP001" {...field} />
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
                    <FormLabel>Working Days (Monthly)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={31}
                        placeholder="22"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Set the monthly working days for this employee.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
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
                    <Input placeholder="John Doe" {...field} />
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
                    <Input placeholder="Spouse, Parent, etc." {...field} />
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
                  <FormLabel>Phone</FormLabel>
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
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="emergency@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="emergencyContactAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Full address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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

        {/* Professional Links */}
        <Card>
          <CardHeader>
            <CardTitle>Professional Links</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          {/* Employment Tab */}
          <TabsContent value="employment" className="space-y-6">
            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>Employment Management</CardTitle>
                  <CardDescription>Administrative employment settings</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="EMPLOYEE">Employee</SelectItem>
                            <SelectItem value="MANAGER">Manager</SelectItem>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select branch" />
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
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedDepartmentId(value);
                          // Reset designation when department changes
                          form.setValue("designationId", "");
                        }} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {departments.map((department) => (
                              <SelectItem key={department.id} value={department.id}>
                                {department.name}
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select designation" />
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Leave & Allowance Tab */}
          <TabsContent value="leave-allowance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Leave & Allowance Information</CardTitle>
                <CardDescription>View your leave balance and allowance details</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  Leave and allowance information will be displayed here based on your employment records.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-4">
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
      </form>
    </Form>
  );
}
