"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { LoanStatus } from "@prisma/client";
import { calculateEMI } from "@/lib/services/loan.service";
import { revalidatePath } from "next/cache";

/**
 * Create a manually seeded loan by admin for an employee
 * Used for legacy/ongoing loans that need to be registered in the system
 */
export async function createManualLoan(data: {
  userId: string;
  loanAmount: number;
  startDate: string; // ISO date string
  endDate: string;   // ISO date string
  gracePeriodMonths: number;
  paidInstallmentAmount: number;
  reason?: string;
}) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    // Verify admin
    const admin = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, role: true },
    });

    if (!admin || admin.role !== "SUPERADMIN") {
      return { success: false, error: "Only admins can create manual loans" };
    }

    // Verify employee exists
    const employee = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, firstName: true, lastName: true, baseSalary: true },
    });

    if (!employee) {
      return { success: false, error: "Employee not found" };
    }

    // Calculate loan parameters
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (startDate >= endDate) {
      return { success: false, error: "Start date must be before end date" };
    }

    // Calculate months between start and end
    const monthsDiff =
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth());

    if (monthsDiff <= 0) {
      return { success: false, error: "Loan duration must be at least 1 month" };
    }

    const emiMonths = monthsDiff - data.gracePeriodMonths;

    if (emiMonths <= 0) {
      return {
        success: false,
        error: "End date must be far enough to include at least 1 EMI month after grace period",
      };
    }

    // Validate paid amount
    if (data.paidInstallmentAmount < 0 || data.paidInstallmentAmount > data.loanAmount) {
      return {
        success: false,
        error: `Paid amount must be between 0 and ${data.loanAmount}`,
      };
    }

    // Calculate remaining principal after amount already paid
    const remainingPrincipal = Math.max(0, data.loanAmount - data.paidInstallmentAmount);
    const baseEmi = Math.round(data.loanAmount / emiMonths);
    const currentEmi = calculateEMI(remainingPrincipal, emiMonths);

    const emiStartDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + data.gracePeriodMonths,
      1
    );

    const currentDate = new Date();
    const monthsElapsedSinceEmiStart = currentDate < emiStartDate
      ? 0
      : (currentDate.getFullYear() - emiStartDate.getFullYear()) * 12 +
        (currentDate.getMonth() - emiStartDate.getMonth());
    const remainingEmiMonths = Math.max(1, emiMonths - monthsElapsedSinceEmiStart);

    // Create loan
    const loan = await prisma.loan.create({
      data: {
        userId: data.userId,
        issuedAmount: data.loanAmount,
        remainingPrincipal,
        gracePeriodMonths: data.gracePeriodMonths,
        totalMonths: monthsDiff,
        status: LoanStatus.ACTIVE,
        // isManuallySeeded: true, // TODO: Enable after migration applied
        reason: data.reason || "Manual registration by admin",
        emiStartMonth: emiStartDate.getMonth() + 1,
        emiStartYear: emiStartDate.getFullYear(),
      },
    });

    // Create EMI state
    await prisma.emiState.create({
      data: {
        loanId: loan.id,
        currentEmi: calculateEMI(remainingPrincipal, remainingEmiMonths),
        carryForward: 0,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        loanId: loan.id,
        changeReason: `Manual loan created for ${employee.firstName} ${employee.lastName}: ৳${data.loanAmount} (${monthsDiff} total months, ${data.gracePeriodMonths} grace, ${emiMonths} EMI months, ৳${data.paidInstallmentAmount} paid, base EMI ৳${baseEmi}, remaining months ${remainingEmiMonths})`,
      },
    });

    revalidatePath("/admin/loans");
    revalidatePath(`/admin/employees/${data.userId}`);

    return {
      success: true,
      data: loan,
      message: `Manual loan of ৳${data.loanAmount} created successfully for ${employee.firstName} ${employee.lastName}`,
    };
  } catch (error) {
    console.error("Error creating manual loan:", error);
    return { success: false, error: "Failed to create manual loan" };
  }
}

/**
 * Get manual loans for viewing/editing
 */
export async function getManualLoans() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const admin = await prisma.user.findUnique({
      where: { clerkId },
      select: { role: true },
    });

    if (!admin || admin.role !== "SUPERADMIN") {
      return { success: false, error: "Unauthorized" };
    }

    const loans = await prisma.loan.findMany({
      // TODO: Enable filter after migration applied
      // where: { isManuallySeeded: true },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            baseSalary: true,
          },
        },
        emiState: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: loans };
  } catch (error) {
    console.error("Error fetching manual loans:", error);
    return { success: false, error: "Failed to fetch manual loans" };
  }
}
