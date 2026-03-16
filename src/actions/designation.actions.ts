"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";
import { logManagerOrganizationAction } from "./manager-organization.actions";

function canManageOrganization(user: Awaited<ReturnType<typeof getDbUser>>) {
  return !!user && (user.role === "SUPERADMIN" || (user.role === "EMPLOYEE" && user.isManager));
}

async function notifyIfManager(params: {
  user: NonNullable<Awaited<ReturnType<typeof getDbUser>>>;
  action: "CREATED" | "UPDATED" | "DELETED" | "ACTIVATED" | "DEACTIVATED";
  entityId: string;
  entityName: string;
  details?: string;
}) {
  if (params.user.role === "EMPLOYEE" && params.user.isManager) {
    const actorName = [params.user.firstName, params.user.lastName].filter(Boolean).join(" ") || params.user.email;
    await logManagerOrganizationAction({
      actorId: params.user.id,
      actorName,
      action: params.action,
      entityType: "designation",
      entityId: params.entityId,
      entityName: params.entityName,
      details: params.details,
    });
  }
}

export async function getAllDesignations(includeInactive = false) {
  const admin = await getDbUser();
  if (!canManageOrganization(admin)) {
    throw new Error("Unauthorized");
  }

  return await prisma.designation.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: {
      department: {
        select: {
          id: true,
          name: true,
          isActive: true
        }
      },
      _count: {
        select: {
          users: true
        }
      }
    },
    orderBy: [
      { department: { name: "asc" } },
      { name: "asc" }
    ]
  });
}

export async function getActiveDesignations() {
  return await prisma.designation.findMany({
    where: { isActive: true },
    include: {
      department: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: { name: "asc" }
  });
}

export async function getDesignationsByDepartment(departmentId: string, includeInactive = false) {
  return await prisma.designation.findMany({
    where: {
      departmentId,
      ...(includeInactive ? {} : { isActive: true })
    },
    orderBy: { name: "asc" }
  });
}

export async function getDesignationById(id: string) {
  const admin = await getDbUser();
  if (!canManageOrganization(admin)) {
    throw new Error("Unauthorized");
  }

  return await prisma.designation.findUnique({
    where: { id },
    include: {
      department: true,
      _count: {
        select: {
          users: true
        }
      }
    }
  });
}

export async function createDesignation(data: {
  name: string;
  description?: string;
  departmentId: string;
}) {
  const admin = await getDbUser();
  if (!canManageOrganization(admin)) {
    throw new Error("Unauthorized");
  }

  try {
    const designation = await prisma.designation.create({
      data: {
        name: data.name,
        description: data.description,
        departmentId: data.departmentId
      },
      include: {
        department: true
      }
    });

    await notifyIfManager({
      user: admin!,
      action: "CREATED",
      entityId: designation.id,
      entityName: designation.name,
      details: `department=${designation.department.name}`,
    });

    revalidatePath("/admin/organization");
    revalidatePath("/manager/organization");
    return { success: true, designation };
  } catch (error: unknown) {
    if (error instanceof Object && 'code' in error && error.code === "P2002") {
      return { success: false, error: "Designation name already exists in this department" };
    }
    return { success: false, error: "Failed to create designation" };
  }
}

export async function updateDesignation(id: string, data: {
  name?: string;
  description?: string;
  departmentId?: string;
}) {
  const admin = await getDbUser();
  if (!canManageOrganization(admin)) {
    throw new Error("Unauthorized");
  }

  try {
    const designation = await prisma.designation.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        departmentId: data.departmentId
      },
      include: {
        department: true
      }
    });

    await notifyIfManager({
      user: admin!,
      action: "UPDATED",
      entityId: designation.id,
      entityName: designation.name,
      details: `department=${designation.department.name}`,
    });

    revalidatePath("/admin/organization");
    revalidatePath("/manager/organization");
    return { success: true, designation };
  } catch (error: unknown) {
    if (error instanceof Object && 'code' in error && error.code === "P2002") {
      return { success: false, error: "Designation name already exists in this department" };
    }
    return { success: false, error: "Failed to update designation" };
  }
}

export async function toggleDesignationStatus(id: string) {
  const admin = await getDbUser();
  if (!canManageOrganization(admin)) {
    throw new Error("Unauthorized");
  }

  try {
    const designation = await prisma.designation.findUnique({
      where: { id },
      select: { isActive: true }
    });

    if (!designation) {
      return { success: false, error: "Designation not found" };
    }

    await prisma.designation.update({
      where: { id },
      data: { isActive: !designation.isActive }
    });

    const updatedDesignation = await prisma.designation.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true }
    });

    if (updatedDesignation) {
      await notifyIfManager({
        user: admin!,
        action: updatedDesignation.isActive ? "ACTIVATED" : "DEACTIVATED",
        entityId: updatedDesignation.id,
        entityName: updatedDesignation.name,
      });
    }

    revalidatePath("/admin/organization");
    revalidatePath("/manager/organization");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to toggle designation status" };
  }
}

export async function deleteDesignation(id: string) {
  const admin = await getDbUser();
  if (!canManageOrganization(admin)) {
    throw new Error("Unauthorized");
  }

  try {
    // Check if designation has users
    const designation = await prisma.designation.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true
          }
        }
      }
    });

    if (!designation) {
      return { success: false, error: "Designation not found" };
    }

    if (designation._count.users > 0) {
      return { success: false, error: "Cannot delete designation with assigned employees. Archive it instead." };
    }

    await prisma.designation.delete({
      where: { id }
    });

    await notifyIfManager({
      user: admin!,
      action: "DELETED",
      entityId: designation.id,
      entityName: designation.name,
    });

    revalidatePath("/admin/organization");
    revalidatePath("/manager/organization");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete designation" };
  }
}
