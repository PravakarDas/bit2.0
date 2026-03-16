"use client";

import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { User } from "@prisma/client";
import { format } from "date-fns";
import {
  User as UserIcon,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  AlertCircle,
  CreditCard,
  Globe,
  Github,
  Linkedin,
  Building2,
  Edit,
} from "lucide-react";

interface ProfileViewProps {
  user: User & {
    branch?: {
      id: string;
      name: string;
      location: string;
    } | null;
    department?: {
      id: string;
      name: string;
    } | null;
    designation?: {
      id: string;
      name: string;
    } | null;
  };
  onEdit?: () => void;
  canEdit?: boolean;
}

export function ProfileView({ user, onEdit, canEdit = false }: ProfileViewProps) {
  const formatDate = (date: Date | null | undefined) => {
    if (!date) return "Not provided";
    return format(new Date(date), "PPP");
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {user.imageUrl ? (
                <Image
                  src={user.imageUrl}
                  alt={`${user.firstName} ${user.lastName}`}
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-full object-cover border-2 border-primary/20"
                />
              ) : (
                <div className="h-20 w-20 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                  {user.firstName?.[0]}{user.lastName?.[0]}
                </div>
              )}
              <div>
                <CardTitle className="text-2xl">
                  {user.firstName} {user.lastName}
                </CardTitle>
                <CardDescription className="text-base mt-1">
                  {user.designation?.name || "Employee"} • {user.department?.name || "Department not set"}
                </CardDescription>
                <div className="flex gap-2 mt-2">
                  <Badge variant={user.employeeStatus === "ACTIVE" ? "default" : "secondary"}>
                    {user.employeeStatus}
                  </Badge>
                  <Badge variant="outline">{user.role}</Badge>
                </div>
              </div>
            </div>
            {canEdit && onEdit && (
              <Button onClick={onEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Profile
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoItem label="Gender" value={user.gender} />
          <InfoItem label="Date of Birth" value={formatDate(user.dateOfBirth)} />
          <InfoItem label="Blood Group" value={user.bloodGroup} />
          <InfoItem label="NID Number" value={user.nidNumber} />
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoItem label="Phone Number" value={user.phoneNumber} icon={<Phone className="h-4 w-4" />} />
          <InfoItem label="Personal Email" value={user.personalEmail} icon={<Mail className="h-4 w-4" />} />
          <InfoItem label="Work Email" value={user.email} icon={<Mail className="h-4 w-4" />} />
        </CardContent>
      </Card>

      {/* Address Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Address Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="font-semibold mb-3 text-sm text-muted-foreground">Current Address</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoItem label="Street" value={user.currentStreet} />
              <InfoItem label="City" value={user.currentCity} />
              <InfoItem label="State" value={user.currentState} />
              <InfoItem label="Country" value={user.currentCountry} />
              <InfoItem label="Postal Code" value={user.currentPostalCode} />
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-semibold mb-3 text-sm text-muted-foreground">Permanent Address</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoItem label="Street" value={user.permanentStreet} />
              <InfoItem label="City" value={user.permanentCity} />
              <InfoItem label="State" value={user.permanentState} />
              <InfoItem label="Country" value={user.permanentCountry} />
              <InfoItem label="Postal Code" value={user.permanentPostalCode} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Employment Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Employment Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoItem label="Role" value={user.role} />
          <InfoItem label="Designation" value={user.designation?.name} />
          <InfoItem label="Department" value={user.department?.name} />
          <InfoItem label="Date of Joining" value={formatDate(user.dateOfJoining)} icon={<Calendar className="h-4 w-4" />} />
          <InfoItem label="Attendance ID" value={user.attendanceId} />
          <InfoItem label="Working Days (Monthly)" value={user.workingDaysInMonth?.toString()} />
          {user.branch && (
            <InfoItem 
              label="Branch" 
              value={`${user.branch.name} (${user.branch.location})`}
              icon={<Building2 className="h-4 w-4" />}
            />
          )}
          <InfoItem
            label="Loan Papers Link"
            value={user.loanPapersLink}
            isLink
            icon={<Globe className="h-4 w-4" />}
          />
          <InfoItem
            label="Nominees Papers Link"
            value={user.nomineesPapersLink}
            isLink
            icon={<Globe className="h-4 w-4" />}
          />
          <InfoItem
            label="Emergency Contact Link"
            value={user.emergencyContactLink}
            isLink
            icon={<Globe className="h-4 w-4" />}
          />
          <InfoItem
            label="Personal Info Link"
            value={user.personalInfoLink}
            isLink
            icon={<Globe className="h-4 w-4" />}
          />
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Emergency Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoItem label="Name" value={user.emergencyContactName} />
          <InfoItem label="Relationship" value={user.emergencyContactRelationship} />
          <InfoItem label="Phone" value={user.emergencyContactPhone} icon={<Phone className="h-4 w-4" />} />
          <InfoItem label="Email" value={user.emergencyContactEmail} icon={<Mail className="h-4 w-4" />} />
          <InfoItem label="NID Number" value={user.emergencyContactNid} />
          <div className="md:col-span-2">
            <InfoItem label="Address" value={user.emergencyContactAddress} />
          </div>
        </CardContent>
      </Card>

      {/* Nominee Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Nominee Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoItem label="Name" value={user.nomineeName} />
          <InfoItem label="Relationship" value={user.nomineeRelationship} />
          <InfoItem label="Phone" value={user.nomineePhone} icon={<Phone className="h-4 w-4" />} />
          <InfoItem label="Email" value={user.nomineeEmail} icon={<Mail className="h-4 w-4" />} />
          <InfoItem label="NID Number" value={user.nomineeNid} />
          <InfoItem label="Address" value={user.nomineeAddress} className="md:col-span-2" />
        </CardContent>
      </Card>

      {/* Banking Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Banking Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InfoItem 
            label="Bank Account Number" 
            value={user.bankAccountNumber ? `****${user.bankAccountNumber.slice(-4)}` : undefined} 
          />
        </CardContent>
      </Card>

      {/* Professional Links */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Professional Links
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoItem 
            label="Portfolio" 
            value={user.portfolioLink}
            isLink
            icon={<Globe className="h-4 w-4" />}
          />
          <InfoItem 
            label="GitHub" 
            value={user.githubLink}
            isLink
            icon={<Github className="h-4 w-4" />}
          />
          <InfoItem 
            label="LinkedIn" 
            value={user.linkedinLink}
            isLink
            icon={<Linkedin className="h-4 w-4" />}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Helper component for displaying info items
function InfoItem({
  label,
  value,
  icon,
  isLink = false,
  className,
}: {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
  isLink?: boolean;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className || ""}`}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        {isLink && value ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            {value}
          </a>
        ) : (
          <p className="text-sm">{value || "Not provided"}</p>
        )}
      </div>
    </div>
  );
}
