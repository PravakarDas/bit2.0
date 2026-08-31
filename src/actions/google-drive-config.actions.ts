"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";
import { getOrCreateGoogleDriveConfig, googleDriveService } from "@/lib/services/google-drive.service";
import {
  canManageGoogleDriveConfig,
  maskGoogleDriveConfig,
  buildGoogleDriveConfigUpdateData,
  validateGoogleDriveConfigInput,
} from "@/lib/google-drive-config";

type UpdatePayload = {
  serviceAccountEmail: string;
  privateKey?: string;
  sharedDriveId?: string;
  rootFolderId: string;
  rootFolderName: string;
};

export async function getGoogleDriveConfig() {
  const user = await getDbUser();
  if (!user || !canManageGoogleDriveConfig(user)) {
    throw new Error("Unauthorized");
  }

  const config = await getOrCreateGoogleDriveConfig();
  return maskGoogleDriveConfig(config);
}

export async function updateGoogleDriveConfig(payload: UpdatePayload) {
  const user = await getDbUser();
  if (!user || !canManageGoogleDriveConfig(user)) {
    throw new Error("Unauthorized");
  }

  const serviceAccountEmail = (payload.serviceAccountEmail || "").trim();
  const rootFolderId = (payload.rootFolderId || "").trim();
  const rootFolderName = (payload.rootFolderName || "").trim() || "Payroll";
  const sharedDriveId = (payload.sharedDriveId || "").trim() || null;
  const privateKey = payload.privateKey || "";

  const current = await getOrCreateGoogleDriveConfig();

  const errors = validateGoogleDriveConfigInput({
    serviceAccountEmail,
    rootFolderId,
    privateKey,
    hasExistingPrivateKey: !!current.privateKeyEncrypted,
  });

  if (errors.length > 0) {
    return { success: false, message: errors.join(" ") };
  }

  const data = buildGoogleDriveConfigUpdateData({
    serviceAccountEmail,
    sharedDriveId,
    rootFolderId,
    rootFolderName,
    privateKey,
  });

  await prisma.googleDriveConfig.update({
    where: { id: "global" },
    data: {
      ...data,
      updatedById: user.id,
      updatedByEmail: user.email,
      updatedByRole: user.role,
    },
  });

  revalidatePath("/admin/system-control");

  return { success: true, message: "Google Drive configuration saved successfully." };
}

/**
 * Permission-check-only — see `google-drive-client.ts`'s `testConnection()`
 * doc comment. Never uploads, creates, or deletes a file; never touches the
 * Payroll/month/branch folder structure the real payroll flow will use
 * later — that's explicitly out of scope for this phase.
 */
export async function testGoogleDriveConnection() {
  const user = await getDbUser();
  if (!user || !canManageGoogleDriveConfig(user)) {
    throw new Error("Unauthorized");
  }

  return googleDriveService.testConnection();
}
