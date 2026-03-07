"use server";

import { updateUserRole, bulkUpdateUserRoles, toggleUserArchiveStatus } from "./role-management.actions";
import { Role } from "@prisma/client";

export async function updateUserRoleAction(userId: string, newRole: Role, reason?: string) {
    return await updateUserRole(userId, newRole, reason);
}

export async function bulkUpdateUserRolesAction(updates: Array<{ userId: string; newRole: Role }>) {
    return await bulkUpdateUserRoles(updates);
}

export async function toggleUserArchiveStatusAction(userId: string) {
    return await toggleUserArchiveStatus(userId);
}