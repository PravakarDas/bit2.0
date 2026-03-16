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
      entityType: "department",
      entityId: params.entityId,
      entityName: params.entityName,
      details: params.details,
    });
  }
}

export async function getAllDepartments(includeInactive = false) {
  const admin = await getDbUser();
  if (!canManageOrganization(admin)) {
    throw new Error("Unauthorized");
  }

  return await prisma.department.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: {
      parent: true,
      children: true,
      _count: {
        select: {
          designations: true,
          users: true
        }
      }
    },
    orderBy: { name: "asc" }
  });
}

export async function getActiveDepartments() {
  return await prisma.department.findMany({
    where: { isActive: true },
    include: {
      parent: { select: { id: true, name: true } }
    },
    orderBy: { name: "asc" }
  });
}

export async function getDepartmentById(id: string) {
  const admin = await getDbUser();
  if (!canManageOrganization(admin)) {
    throw new Error("Unauthorized");
  }

  return await prisma.department.findUnique({
    where: { id },
    include: {
      parent: true,
      children: true,
      designations: {
        where: { isActive: true }
      },
      _count: {
        select: {
          users: true
        }
      }
    }
  });
}

export async function createDepartment(data: {
  name: string;
  description?: string;
  parentId?: string;
}) {
  const admin = await getDbUser();
  if (!canManageOrganization(admin)) {
    throw new Error("Unauthorized - Only Super Admins can create departments");
  }

  try {
    const department = await prisma.department.create({
      data: {
        name: data.name,
        description: data.description,
        parentId: data.parentId || null
      }
    });

    await notifyIfManager({
      user: admin!,
      action: "CREATED",
      entityId: department.id,
      entityName: department.name,
      details: data.parentId ? `parentId=${data.parentId}` : undefined,
    });

    revalidatePath("/admin/organization");
    revalidatePath("/manager/organization");
    return { success: true, department };
  } catch (error: unknown) {
    if (error instanceof Object && 'code' in error && error.code === "P2002") {
      return { success: false, error: "Department name already exists" };
    }
    return { success: false, error: "Failed to create department" };
  }
}

export async function updateDepartment(id: string, data: {
  name?: string;
  description?: string;
  parentId?: string | null;
}) {
  const admin = await getDbUser();
  if (!canManageOrganization(admin)) {
    throw new Error("Unauthorized - Only Super Admins can update departments");
  }

  try {
    // Prevent circular reference
    if (data.parentId) {
      const isDescendant = await checkIfDescendant(id, data.parentId);
      if (isDescendant) {
        return { success: false, error: "Cannot set a child department as parent (circular reference)" };
      }
    }

    const department = await prisma.department.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        ...(data.parentId !== undefined && { parentId: data.parentId })
      }
    });

    await notifyIfManager({
      user: admin!,
      action: "UPDATED",
      entityId: department.id,
      entityName: department.name,
      details: data.parentId !== undefined ? `parentId=${data.parentId ?? "none"}` : undefined,
    });

    revalidatePath("/admin/organization");
    revalidatePath("/manager/organization");
    return { success: true, department };
  } catch (error: unknown) {
    if (error instanceof Object && 'code' in error && error.code === "P2002") {
      return { success: false, error: "Department name already exists" };
    }
    return { success: false, error: "Failed to update department" };
  }
}

export async function toggleDepartmentStatus(id: string) {
  const admin = await getDbUser();
  if (!canManageOrganization(admin)) {
    throw new Error("Unauthorized - Only Super Admins can toggle department status");
  }

  try {
    const department = await prisma.department.findUnique({
      where: { id },
      select: { isActive: true }
    });

    if (!department) {
      return { success: false, error: "Department not found" };
    }

    await prisma.department.update({
      where: { id },
      data: { isActive: !department.isActive }
    });

    const updatedDepartment = await prisma.department.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true }
    });

    if (updatedDepartment) {
      await notifyIfManager({
        user: admin!,
        action: updatedDepartment.isActive ? "ACTIVATED" : "DEACTIVATED",
        entityId: updatedDepartment.id,
        entityName: updatedDepartment.name,
      });
    }

    revalidatePath("/admin/organization");
    revalidatePath("/manager/organization");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to toggle department status" };
  }
}

export async function deleteDepartment(id: string) {
  const admin = await getDbUser();
  if (!canManageOrganization(admin)) {
    throw new Error("Unauthorized - Only Super Admins can delete departments");
  }

  try {
    // Check if department has users or designations
    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            designations: true,
            children: true
          }
        }
      }
    });

    if (!department) {
      return { success: false, error: "Department not found" };
    }

    if (department._count.users > 0) {
      return { success: false, error: "Cannot delete department with assigned employees. Archive it instead." };
    }

    if (department._count.designations > 0) {
      return { success: false, error: "Cannot delete department with designations. Archive it instead." };
    }

    if (department._count.children > 0) {
      return { success: false, error: "Cannot delete department with child departments. Archive it instead." };
    }

    await prisma.department.delete({
      where: { id }
    });

    await notifyIfManager({
      user: admin!,
      action: "DELETED",
      entityId: department.id,
      entityName: department.name,
    });

    revalidatePath("/admin/organization");
    revalidatePath("/manager/organization");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete department" };
  }
}

// Helper function to check circular reference
async function checkIfDescendant(departmentId: string, potentialParentId: string): Promise<boolean> {
  if (departmentId === potentialParentId) return true;

  const potentialParent = await prisma.department.findUnique({
    where: { id: potentialParentId },
    select: { parentId: true }
  });

  if (!potentialParent || !potentialParent.parentId) return false;

  return checkIfDescendant(departmentId, potentialParent.parentId);
}
