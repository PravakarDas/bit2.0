"use server";

import { prisma } from "@/lib/prisma";
import { LoanStatus, OvertimeRequestStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";

/**
 * Manager: Get pending loans for verification
 */
export async function getPendingLoansForManager() {
  const user = await getDbUser();

  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized - Only managers can access this");
  }

  // Get all pending loans for all employees
  return await prisma.loan.findMany({
    where: {
      status: LoanStatus.PENDING,
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          baseSalary: true,
          walletBalance: true,
          dateOfJoining: true,
          department: {
            select: {
              name: true,
            },
          },
          designation: {
            select: {
              name: true,
            },
          },
          branch: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Manager: Get pending overtime requests for verification
 */
export async function getPendingOvertimeForManager() {
  const user = await getDbUser();

  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized - Only managers can access this");
  }

  // Get all pending overtime requests for all employees
  return await prisma.overtimeRequest.findMany({
    where: {
      status: OvertimeRequestStatus.PENDING,
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          department: {
            select: {
              name: true,
            },
          },
          designation: {
            select: {
              name: true,
            },
          },
          branch: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Manager: Verify a loan request
 */
export async function verifyLoanRequest(
  loanId: string,
  comments?: string
) {
  const user = await getDbUser();

  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized");
  }

  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
  });

  if (!loan) {
    throw new Error("Loan not found");
  }

  if (loan.status !== LoanStatus.PENDING) {
    throw new Error("Only pending loans can be verified");
  }

  return await prisma.$transaction(async (tx) => {
    // Update loan with manager verification
    const updatedLoan = await tx.loan.update({
      where: { id: loanId },
      data: {
        status: LoanStatus.MANAGER_VERIFIED,
        managerVerifiedAt: new Date(),
        managerVerifiedById: user.id,
        managerComments: comments || null,
      },
    });

    // Create admin notification
    const employee = await tx.user.findUnique({
      where: { id: loan.userId },
      select: { firstName: true, lastName: true },
    });

    await tx.adminNotification.create({
      data: {
        type: "LOAN_APPLICATION_PENDING",
        title: `Manager Verified Loan Request`,
        message: `Manager ${user.firstName} ${user.lastName} has verified the loan request of ${employee?.firstName} ${employee?.lastName} for amount ₹${loan.issuedAmount.toLocaleString()}. ${comments ? `Manager's notes: ${comments}` : ""}`,
        metadata: {
          loanId: loan.id,
          employeeId: loan.userId,
          managerId: user.id,
          verificationStatus: "VERIFIED",
          comments,
        },
      },
    });

    // Log to timeline/audit
    await tx.auditLog.create({
      data: {
        loanId: loan.id,
        oldEmi: 0,
        newEmi: 0,
        changeReason: `Loan verified by manager ${user.id} (${user.firstName} ${user.lastName})${comments ? `. Notes: ${comments}` : ""}`,
      },
    });

    revalidatePath("/admin/loans");
    revalidatePath("/manager/loans");
    return updatedLoan;
  });
}

/**
 * Manager: Reject a loan request
 */
export async function rejectLoanRequest(
  loanId: string,
  rejectionReason: string
) {
  const user = await getDbUser();

  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized");
  }

  if (!rejectionReason || rejectionReason.trim() === "") {
    throw new Error("Rejection reason is required");
  }

  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
  });

  if (!loan) {
    throw new Error("Loan not found");
  }

  if (loan.status !== LoanStatus.PENDING) {
    throw new Error("Only pending loans can be rejected");
  }

  return await prisma.$transaction(async (tx) => {
    // Update loan with manager rejection
    const updatedLoan = await tx.loan.update({
      where: { id: loanId },
      data: {
        status: LoanStatus.MANAGER_REJECTED,
        managerVerifiedAt: new Date(),
        managerVerifiedById: user.id,
        managerRejectionReason: rejectionReason,
      },
    });

    // Create employee notification
    const employee = await tx.user.findUnique({
      where: { id: loan.userId },
      select: { firstName: true, lastName: true },
    });

    await tx.employeeNotification.create({
      data: {
        userId: loan.userId,
        type: "LOAN_APPLICATION_DECLINED",
        title: "Loan Request Rejected",
        message: `Your loan request for ₹${loan.issuedAmount.toLocaleString()} has been rejected by Manager ${user.firstName} ${user.lastName}. Reason: ${rejectionReason}`,
        relatedEntityId: loan.id,
      },
    });

    // Log to timeline/audit
    await tx.auditLog.create({
      data: {
        loanId: loan.id,
        oldEmi: 0,
        newEmi: 0,
        changeReason: `Loan rejected by manager ${user.id} (${user.firstName} ${user.lastName}). Reason: ${rejectionReason}`,
      },
    });

    revalidatePath("/employee/loans");
    revalidatePath("/manager/loans");
    return updatedLoan;
  });
}

/**
 * Manager: Verify an overtime request
 */
export async function verifyOvertimeRequest(
  overtimeId: string,
  comments?: string
) {
  const user = await getDbUser();

  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized");
  }

  const overtimeRequest = await prisma.overtimeRequest.findUnique({
    where: { id: overtimeId },
  });

  if (!overtimeRequest) {
    throw new Error("Overtime request not found");
  }

  if (overtimeRequest.status !== OvertimeRequestStatus.PENDING) {
    throw new Error("Only pending overtime requests can be verified");
  }

  return await prisma.$transaction(async (tx) => {
    // Update overtime request with manager verification
    const updatedRequest = await tx.overtimeRequest.update({
      where: { id: overtimeId },
      data: {
        status: "MANAGER_VERIFIED" as any,
        managerVerifiedAt: new Date(),
        managerVerifiedById: user.id,
        managerComments: comments || null,
      },
    });

    // Create admin notification
    const employee = await tx.user.findUnique({
      where: { id: overtimeRequest.userId },
      select: { firstName: true, lastName: true },
    });

    const overtimeDate = new Date(overtimeRequest.overtimeDate).toLocaleDateString();

    await tx.adminNotification.create({
      data: {
        type: "OVERTIME_REQUEST_PENDING",
        title: `Manager Verified Overtime Request`,
        message: `Manager ${user.firstName} ${user.lastName} has verified the overtime request of ${employee?.firstName} ${employee?.lastName} for ${overtimeRequest.totalOvertime} hours on ${overtimeDate}. ${comments ? `Manager's notes: ${comments}` : ""}`,
        metadata: {
          overtimeRequestId: overtimeRequest.id,
          employeeId: overtimeRequest.userId,
          managerId: user.id,
          verificationStatus: "VERIFIED",
          totalOvertime: overtimeRequest.totalOvertime,
          overtimeDate: overtimeRequest.overtimeDate,
          comments,
        },
      },
    });

    revalidatePath("/admin/overtime-requests");
    revalidatePath("/manager/overtime-requests");
    return updatedRequest;
  });
}

/**
 * Manager: Reject an overtime request
 */
export async function rejectOvertimeRequest(
  overtimeId: string,
  rejectionReason: string
) {
  const user = await getDbUser();

  if (!user || user.role !== "EMPLOYEE" || !user.isManager) {
    throw new Error("Unauthorized");
  }

  if (!rejectionReason || rejectionReason.trim() === "") {
    throw new Error("Rejection reason is required");
  }

  const overtimeRequest = await prisma.overtimeRequest.findUnique({
    where: { id: overtimeId },
  });

  if (!overtimeRequest) {
    throw new Error("Overtime request not found");
  }

  if (overtimeRequest.status !== OvertimeRequestStatus.PENDING) {
    throw new Error("Only pending overtime requests can be rejected");
  }

  return await prisma.$transaction(async (tx) => {
    // Update overtime request with manager rejection
    const updatedRequest = await tx.overtimeRequest.update({
      where: { id: overtimeId },
      data: {
        status: "MANAGER_REJECTED" as any,
        managerVerifiedAt: new Date(),
        managerVerifiedById: user.id,
        managerRejectionReason: rejectionReason,
      },
    });

    // Create employee notification
    const employee = await tx.user.findUnique({
      where: { id: overtimeRequest.userId },
      select: { firstName: true, lastName: true },
    });

    const overtimeDate = new Date(overtimeRequest.overtimeDate).toLocaleDateString();

    await tx.employeeNotification.create({
      data: {
        userId: overtimeRequest.userId,
        type: "OVERTIME_REQUEST_DECLINED",
        title: "Overtime Request Rejected",
        message: `Your overtime request for ${overtimeRequest.totalOvertime} hours on ${overtimeDate} has been rejected by Manager ${user.firstName} ${user.lastName}. Reason: ${rejectionReason}`,
        relatedEntityId: overtimeRequest.id,
      },
    });

    revalidatePath("/employee/overtime-requests");
    revalidatePath("/manager/overtime-requests");
    return updatedRequest;
  });
}

/**
 * Admin: Get all loans (updated to include manager verification info)
 */
export async function getAllLoansWithManagerInfo() {
  const user = await getDbUser();

  if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
    throw new Error("Unauthorized access to loan management");
  }

  return await prisma.loan.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          baseSalary: true,
          walletBalance: true,
          dateOfJoining: true,
          department: {
            select: {
              name: true,
            },
          },
          designation: {
            select: {
              name: true,
            },
          },
          branch: {
            select: {
              name: true,
            },
          },
        },
      },
      managerVerifiedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      emiState: true,
    },
  });
}

/**
 * Admin: Get all overtime requests (updated to include manager verification info)
 */
export async function getAllOvertimeRequestsWithManagerInfo() {
  const user = await getDbUser();

  if (!user || (user.role !== "SUPERADMIN" && user.role !== "HR")) {
    throw new Error("Unauthorized");
  }

  return await prisma.overtimeRequest.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          department: {
            select: {
              name: true,
            },
          },
          designation: {
            select: {
              name: true,
            },
          },
          branch: {
            select: {
              name: true,
            },
          },
        },
      },
      managerVerifiedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
}
