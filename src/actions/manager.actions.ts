"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";

const prisma = new PrismaClient();

// Manager Employee Management Functions (No Salary Access)
export async function getActiveEmployeesForManager() {
  const user = await getDbUser();
  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized");
  }

  return await prisma.user.findMany({
    where: { 
      isArchived: false,
      role: { not: "SUPERADMIN" }
    },
    select: {
      id: true,
      clerkId: true,
      email: true,
      firstName: true,
      lastName: true,
      imageUrl: true,
      role: true,
      isManager: true,
      status: true,
      employeeStatus: true,
      // Personal Information
      gender: true,
      dateOfBirth: true,
      bloodGroup: true,
      nidNumber: true,
      phoneNumber: true,
      personalEmail: true,
      dateOfJoining: true,
      attendanceId: true,
      // Address Information
      currentStreet: true,
      currentCity: true,
      currentState: true,
      currentCountry: true,
      currentPostalCode: true,
      permanentStreet: true,
      permanentCity: true,
      permanentState: true,
      permanentCountry: true,
      permanentPostalCode: true,
      // Emergency Contact
      emergencyContactName: true,
      emergencyContactRelationship: true,
      emergencyContactPhone: true,
      emergencyContactEmail: true,
      // Nominee Details
      nomineeName: true,
      nomineeRelationship: true,
      nomineePhone: true,
      nomineeEmail: true,
      nomineeNid: true,
      nomineeAddress: true,
      // Work settings (non-salary)
      workingDaysInMonth: true,
      // Professional Info
      portfolioLink: true,
      githubLink: true,
      linkedinLink: true,
      // Employee Document Links
      loanPapersLink: true,
      nomineesPapersLink: true,
      emergencyContactLink: true,
      personalInfoLink: true,
      // Relations (no salary fields)
      branch: {
        select: {
          id: true,
          name: true,
          location: true,
        }
      },
      department: {
        select: {
          id: true,
          name: true,
        }
      },
      designation: {
        select: {
          id: true,
          name: true,
        }
      },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingEmployeesForManager() {
  const user = await getDbUser();
  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized");
  }

  return await prisma.user.findMany({
    where: { 
      status: "PENDING",
      isArchived: false,
      role: { not: "SUPERADMIN" }
    },
    select: {
      id: true,
      clerkId: true,
      email: true,
      firstName: true,
      lastName: true,
      imageUrl: true,
      role: true,
      isManager: true,
      status: true,
      employeeStatus: true,
      dateOfJoining: true,
      attendanceId: true,
      branch: {
        select: {
          id: true,
          name: true,
          location: true,
        }
      },
      department: {
        select: {
          id: true,
          name: true,
        }
      },
      designation: {
        select: {
          id: true,
          name: true,
        }
      },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getArchivedEmployeesForManager() {
  const user = await getDbUser();
  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized");
  }

  return await prisma.user.findMany({
    where: { 
      isArchived: true,
      role: { not: "SUPERADMIN" }
    },
    select: {
      id: true,
      clerkId: true,
      email: true,
      firstName: true,
      lastName: true,
      imageUrl: true,
      role: true,
      isManager: true,
      status: true,
      employeeStatus: true,
      dateOfJoining: true,
      attendanceId: true,
      branch: {
        select: {
          id: true,
          name: true,
          location: true,
        }
      },
      department: {
        select: {
          id: true,
          name: true,
        }
      },
      designation: {
        select: {
          id: true,
          name: true,
        }
      },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

// Manager Approval Function (no salary updates)
export async function approveEmployeeAsManager(userId: string) {
  const approver = await getDbUser();

  if (!approver || approver.role !== "EMPLOYEE" || !approver.isManager) {
    throw new Error("Unauthorized");
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        status: "APPROVED",
        employeeStatus: "ACTIVE",
      },
    });

    // Refresh manager and admin views of employees
    revalidatePath("/manager/employees");
    revalidatePath("/admin/employees");

    return { success: true, user };
  } catch (error) {
    console.error("Error manager approving employee:", error);
    return { success: false, error: "Failed to approve employee" };
  }
}

// Single employee fetch for manager (includes archived)
export async function getEmployeeForManagerById(id: string) {
  const user = await getDbUser();
  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized");
  }

  return await prisma.user.findFirst({
    where: {
      id,
      role: { not: "SUPERADMIN" },
    },
    select: {
      id: true,
      clerkId: true,
      email: true,
      firstName: true,
      lastName: true,
      imageUrl: true,
      role: true,
      isManager: true,
      status: true,
      employeeStatus: true,
      // Personal Information
      gender: true,
      dateOfBirth: true,
      bloodGroup: true,
      nidNumber: true,
      phoneNumber: true,
      personalEmail: true,
      dateOfJoining: true,
      attendanceId: true,
      // Address Information
      currentStreet: true,
      currentCity: true,
      currentState: true,
      currentCountry: true,
      currentPostalCode: true,
      permanentStreet: true,
      permanentCity: true,
      permanentState: true,
      permanentCountry: true,
      permanentPostalCode: true,
      // Emergency Contact
      emergencyContactName: true,
      emergencyContactRelationship: true,
      emergencyContactPhone: true,
      emergencyContactEmail: true,
      // Nominee Details
      nomineeName: true,
      nomineeRelationship: true,
      nomineePhone: true,
      nomineeEmail: true,
      nomineeNid: true,
      nomineeAddress: true,
      // Professional Info
      portfolioLink: true,
      githubLink: true,
      linkedinLink: true,
      // Employee Document Links
      loanPapersLink: true,
      nomineesPapersLink: true,
      emergencyContactLink: true,
      personalInfoLink: true,
      // Work settings (non-salary)
      workingDaysInMonth: true,
      // Relations (no salary fields)
      branch: {
        select: {
          id: true,
          name: true,
          location: true,
        },
      },
      department: {
        select: {
          id: true,
          name: true,
        },
      },
      designation: {
        select: {
          id: true,
          name: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  });
}

// Manager Profile Request Functions
export async function getPendingProfileUpdateRequestsForManager() {
  const user = await getDbUser();
  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized");
  }

  return await prisma.profileUpdateRequest.findMany({
    where: { status: "PENDING" },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          imageUrl: true,
          role: true,
          attendanceId: true,
          branch: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

// Manager Dashboard Functions
export async function getManagerDashboardData(branchId?: string, fromDate?: string, toDate?: string) {
  const user = await getDbUser();
  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized");
  }

  // Calculate date range
  const now = new Date();
  const from = fromDate ? new Date(fromDate) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = toDate ? new Date(toDate) : now;

  // Build where clause for filtering
  const whereClause = {
    ...(branchId && { branchId }),
    isArchived: false,
    status: "APPROVED" as const,
  };

  // Get basic employee statistics (no salary data)
  const [
    totalEmployees,
    activeEmployees,
    pendingProfileRequests,
    pendingLeaveRequests,
    totalBranches,
    recentTimeRecords,
  ] = await Promise.all([
    // Total employees
    prisma.user.count({
      where: {
        ...whereClause,
        role: "EMPLOYEE",
      },
    }),

    // Active employees
    prisma.user.count({
      where: {
        ...whereClause,
        role: "EMPLOYEE",
        employeeStatus: "ACTIVE",
      },
    }),

    // Pending profile requests
    prisma.profileUpdateRequest.count({
      where: {
        status: "PENDING",
        ...(branchId && { user: { branchId } }),
      },
    }),

    // Pending leave requests
    prisma.leaveApplication.count({
      where: {
        status: "PENDING",
        ...(branchId && { user: { branchId } }),
        createdAt: {
          gte: from,
          lte: to,
        },
      },
    }),

    // Total branches
    prisma.branch.count({
      where: { isActive: true },
    }),

    // Recent time records for attendance overview
    prisma.dailyTimeRecord.findMany({
      where: {
        date: {
          gte: from,
          lte: to,
        },
        ...(branchId && { user: { branchId } }),
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            branchId: true,
          },
        },
      },
      orderBy: { date: "desc" },
      take: 100,
    }),
  ]);

  // Calculate attendance metrics
  const attendanceMetrics = {
    presentDays: recentTimeRecords.filter(record => record.status === "PRESENT").length,
    absentDays: recentTimeRecords.filter(record => record.status === "ABSENT").length,
    leaveDays: recentTimeRecords.filter(record => record.status === "ON_LEAVE").length,
    totalDays: recentTimeRecords.length,
  };

  const attendanceRate = attendanceMetrics.totalDays > 0 
    ? ((attendanceMetrics.presentDays / attendanceMetrics.totalDays) * 100).toFixed(1)
    : "0";

  return {
    overview: {
      totalEmployees,
      activeEmployees,
      totalBranches,
      pendingRequests: pendingProfileRequests + pendingLeaveRequests,
    },
    requests: {
      pendingProfileRequests,
      pendingLeaveRequests,
    },
    attendance: {
      ...attendanceMetrics,
      attendanceRate: parseFloat(attendanceRate),
    },
    recentActivity: recentTimeRecords.slice(0, 10).map(record => ({
      id: record.id,
      employeeName: `${record.user.firstName} ${record.user.lastName}`,
      date: record.date,
      status: record.status,
      checkIn: record.actualCheckIn,
      checkOut: record.actualCheckOut,
    })),
  };
}

// Get all branches for filtering
export async function getAllBranches() {
  const user = await getDbUser();
  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized");
  }

  return await prisma.branch.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      location: true,
    },
    orderBy: { name: "asc" },
  });
}

// Manager Holiday and Leave Request Functions
export async function getManagerHolidaysAndLeaveRequests() {
  const user = await getDbUser();
  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized");
  }

  const [holidays, leaveRequests] = await Promise.all([
    // Get upcoming and current holidays
    prisma.publicHoliday.findMany({
      where: { 
        isActive: true,
        date: {
          gte: new Date(), // Only future and today's holidays
        },
      },
      orderBy: { date: "asc" },
    }),

    // Get all leave requests with user details
    prisma.leaveApplication.findMany({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            imageUrl: true,
            attendanceId: true,
            branch: {
              select: {
                name: true,
              }
            }
          }
        },
        leaveType: {
          select: {
            name: true,
            allocatedDays: true,
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100, // Limit to recent requests
    }),
  ]);

  return {
    holidays,
    leaveRequests,
  };
}