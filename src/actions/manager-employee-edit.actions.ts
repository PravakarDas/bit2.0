"use server";

import { prisma } from "@/lib/prisma";
import { createAdminNotification } from "./notification.actions";

export async function logManagerEmployeeEditAction(params: {
  actorId: string;
  actorName: string;
  action: "UPDATED" | "ASSIGNED" | "REMOVED";
  area: "employee_profile" | "employee_employment" | "employee_leave" | "employee_allowance";
  employeeId: string;
  employeeName: string;
  details?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.actorId,
        oldEmi: null,
        newEmi: null,
        changeReason: `Manager ${params.area} ${params.action.toLowerCase()}: ${params.employeeName} (${params.employeeId})${params.details ? `, ${params.details}` : ""}`,
      },
    });

    await createAdminNotification({
      type: "SYSTEM_ALERT",
      title: "Manager Updated Employee Data",
      message: `${params.actorName} ${params.action.toLowerCase()} ${params.area.replaceAll("_", " ")} for ${params.employeeName}`,
      metadata: {
        actorId: params.actorId,
        actorName: params.actorName,
        action: params.action,
        area: params.area,
        employeeId: params.employeeId,
        employeeName: params.employeeName,
        details: params.details ?? null,
        source: "employee_management",
      },
    });
  } catch (error) {
    console.error("Failed to log manager employee edit action:", error);
  }
}
