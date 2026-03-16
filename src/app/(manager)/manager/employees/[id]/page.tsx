import { getEmployeeForManagerById } from "@/actions/manager.actions";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, User, Mail, Building, Calendar, Phone, MapPin, FileText, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { WorkingDaysInput } from "@/components/admin/WorkingDaysInput";
import { EmployeeDocumentLinksForm } from "@/components/admin/EmployeeDocumentLinksForm";

export default async function ManagerEmployeeDetailPage({ 
    params 
}: { 
    params: { id: string } 
}) {
    const { id } = params;
    const employee = await getEmployeeForManagerById(id);

    if (!employee) {
        notFound();
    }

    const employeeName = employee.firstName && employee.lastName
        ? `${employee.firstName} ${employee.lastName}`
        : employee.email;

    const workingDaysInMonth = employee.workingDaysInMonth ?? 22;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/manager/employees">
                    <Button variant="outline" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <Avatar className="h-16 w-16">
                    <AvatarImage src={employee.imageUrl || undefined} alt="Profile picture" />
                    <AvatarFallback className="text-lg">
                        {employee.firstName && employee.lastName
                            ? `${employee.firstName[0]}${employee.lastName[0]}`
                            : employee.email[0].toUpperCase()
                        }
                    </AvatarFallback>
                </Avatar>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Employee Profile</h1>
                    <p className="text-muted-foreground">Profile details for {employeeName}</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Basic Information */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Basic Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                                <p className="font-medium">{employeeName}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Email</label>
                                <p className="font-medium flex items-center gap-2">
                                    <Mail className="h-4 w-4" />
                                    {employee.email}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Role</label>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline">{employee.role}</Badge>
                                    {employee.isManager && (
                                        <Badge variant="default">Manager</Badge>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Status</label>
                                <Badge variant={employee.status === "APPROVED" ? "default" : "secondary"}>
                                    {employee.status}
                                </Badge>
                            </div>
                        </div>
                        {employee.attendanceId && (
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Attendance ID</label>
                                <p className="font-medium">{employee.attendanceId}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Work Information */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building className="h-5 w-5" />
                            Work Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Branch</label>
                            <p className="font-medium">
                                {employee.branch?.name || "Not assigned"}
                            </p>
                            {employee.branch?.location && (
                                <p className="text-sm text-muted-foreground">
                                    {employee.branch.location}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Department</label>
                            <p className="font-medium">
                                {employee.department?.name || "Not assigned"}
                            </p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Designation</label>
                            <p className="font-medium">
                                {employee.designation?.name || "Not assigned"}
                            </p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Employee Status</label>
                            <Badge 
                                variant={
                                    employee.employeeStatus === "ACTIVE" ? "default" :
                                    employee.employeeStatus === "PROBATION" ? "secondary" :
                                    "destructive"
                                }
                            >
                                {employee.employeeStatus || "ACTIVE"}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Employment Details (mirroring admin view, without salary) */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Employment Details
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-muted-foreground">Date of Joining</label>
                        <p className="font-medium flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {employee.dateOfJoining ? formatDate(employee.dateOfJoining) : "Not set"}
                        </p>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-muted-foreground">Working Days (Monthly)</label>
                        <p className="text-sm text-muted-foreground">
                            Current setting: {workingDaysInMonth}
                        </p>
                        <WorkingDaysInput
                            employeeId={employee.id}
                            currentWorkingDays={workingDaysInMonth}
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Emergency Contact */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Phone className="h-5 w-5" />
                            Emergency Contact
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Name</label>
                            <p className="font-medium">{employee.emergencyContactName || "Not provided"}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Relationship</label>
                            <p className="font-medium">{employee.emergencyContactRelationship || "Not provided"}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
                            <p className="font-medium flex items-center gap-2">
                                {employee.emergencyContactPhone ? (
                                    <>
                                        <Phone className="h-4 w-4" />
                                        {employee.emergencyContactPhone}
                                    </>
                                ) : (
                                    "Not provided"
                                )}
                            </p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Email</label>
                            <p className="font-medium flex items-center gap-2">
                                {employee.emergencyContactEmail ? (
                                    <>
                                        <Mail className="h-4 w-4" />
                                        {employee.emergencyContactEmail}
                                    </>
                                ) : (
                                    "Not provided"
                                )}
                            </p>
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
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Name</label>
                            <p className="font-medium">{employee.nomineeName || "Not provided"}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Relationship</label>
                            <p className="font-medium">{employee.nomineeRelationship || "Not provided"}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
                            <p className="font-medium flex items-center gap-2">
                                {employee.nomineePhone ? (
                                    <>
                                        <Phone className="h-4 w-4" />
                                        {employee.nomineePhone}
                                    </>
                                ) : (
                                    "Not provided"
                                )}
                            </p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Email</label>
                            <p className="font-medium flex items-center gap-2">
                                {employee.nomineeEmail ? (
                                    <>
                                        <Mail className="h-4 w-4" />
                                        {employee.nomineeEmail}
                                    </>
                                ) : (
                                    "Not provided"
                                )}
                            </p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">NID Number</label>
                            <p className="font-medium">{employee.nomineeNid || "Not provided"}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Address</label>
                            <p className="font-medium">{employee.nomineeAddress || "Not provided"}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Employee Document Links
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <EmployeeDocumentLinksForm
                        employeeId={employee.id}
                        initialValues={{
                            loanPapersLink: employee.loanPapersLink,
                            nomineesPapersLink: employee.nomineesPapersLink,
                            emergencyContactLink: employee.emergencyContactLink,
                            personalInfoLink: employee.personalInfoLink,
                        }}
                    />
                </CardContent>
            </Card>

            {/* Personal Information */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Personal Information
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {employee.phoneNumber && (
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
                                <p className="font-medium flex items-center gap-2">
                                    <Phone className="h-4 w-4" />
                                    {employee.phoneNumber}
                                </p>
                            </div>
                        )}
                        {employee.personalEmail && (
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Personal Email</label>
                                <p className="font-medium">
                                    {employee.personalEmail}
                                </p>
                            </div>
                        )}
                        {employee.dateOfBirth && (
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Date of Birth</label>
                                <p className="font-medium">
                                    {formatDate(employee.dateOfBirth)}
                                </p>
                            </div>
                        )}
                        {employee.gender && (
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Gender</label>
                                <p className="font-medium">
                                    {employee.gender}
                                </p>
                            </div>
                        )}
                        {employee.bloodGroup && (
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Blood Group</label>
                                <p className="font-medium">
                                    {employee.bloodGroup}
                                </p>
                            </div>
                        )}
                        {employee.nidNumber && (
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">NID Number</label>
                                <p className="font-medium">
                                    {employee.nidNumber}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Address Information */}
                    {(employee.currentStreet || employee.currentCity) && (
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Current Address</label>
                            <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 mt-1" />
                                <div>
                                    {employee.currentStreet && (
                                        <p className="font-medium">{employee.currentStreet}</p>
                                    )}
                                    <p className="text-sm text-muted-foreground">
                                        {[
                                            employee.currentCity,
                                            employee.currentState,
                                            employee.currentCountry,
                                            employee.currentPostalCode
                                        ].filter(Boolean).join(", ")}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Professional Links */}
                    {(employee.portfolioLink || employee.githubLink || employee.linkedinLink) && (
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Professional Links</label>
                            <div className="space-y-1">
                                {employee.portfolioLink && (
                                    <p className="text-sm">
                                        <span className="font-medium">Portfolio:</span>{" "}
                                        <a 
                                            href={employee.portfolioLink} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                        >
                                            {employee.portfolioLink}
                                        </a>
                                    </p>
                                )}
                                {employee.githubLink && (
                                    <p className="text-sm">
                                        <span className="font-medium">GitHub:</span>{" "}
                                        <a 
                                            href={employee.githubLink} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                        >
                                            {employee.githubLink}
                                        </a>
                                    </p>
                                )}
                                {employee.linkedinLink && (
                                    <p className="text-sm">
                                        <span className="font-medium">LinkedIn:</span>{" "}
                                        <a 
                                            href={employee.linkedinLink} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                        >
                                            {employee.linkedinLink}
                                        </a>
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Important Dates */}
                    <div>
                        <label className="text-sm font-medium text-muted-foreground">Important Dates</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                            {employee.dateOfJoining && (
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4" />
                                    <div>
                                        <p className="text-sm font-medium">Date of Joining</p>
                                        <p className="text-sm text-muted-foreground">
                                            {formatDate(employee.dateOfJoining)}
                                        </p>
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <div>
                                    <p className="text-sm font-medium">Account Created</p>
                                    <p className="text-sm text-muted-foreground">
                                        {formatDate(employee.createdAt)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}