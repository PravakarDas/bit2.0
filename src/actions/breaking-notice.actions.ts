"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { BreakingNoticeTargetType } from "@prisma/client";
import { getDbUser } from "./user.actions";
import { createAdminNotification } from "./notification.actions";

type NoticeTargetType = "ALL_EMPLOYEES" | "SINGLE_EMPLOYEE" | "SINGLE_BRANCH";

type NoticePayload = {
  title: string;
  targetType: NoticeTargetType;
  targetUserId?: string;
  targetBranchId?: string;
};

function canManageNotices(user: Awaited<ReturnType<typeof getDbUser>>) {
  return !!user && (user.role === "SUPERADMIN" || (user.role === "EMPLOYEE" && user.isManager));
}

async function resolveRecipientIds(payload: NoticePayload): Promise<string[]> {
  const employeeBaseWhere = {
    role: "EMPLOYEE" as const,
    status: "APPROVED" as const,
    isArchived: false,
  };

  if (payload.targetType === "ALL_EMPLOYEES") {
    const users = await prisma.user.findMany({
      where: employeeBaseWhere,
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  if (payload.targetType === "SINGLE_EMPLOYEE") {
    if (!payload.targetUserId) {
      throw new Error("Target employee is required");
    }

    const user = await prisma.user.findFirst({
      where: {
        id: payload.targetUserId,
        ...employeeBaseWhere,
      },
      select: { id: true },
    });

    if (!user) {
      throw new Error("Selected employee is not eligible");
    }

    return [user.id];
  }

  if (!payload.targetBranchId) {
    throw new Error("Target branch is required");
  }

  const users = await prisma.user.findMany({
    where: {
      ...employeeBaseWhere,
      branchId: payload.targetBranchId,
    },
    select: { id: true },
  });

  return users.map((user) => user.id);
}

function normalizePayload(payload: NoticePayload): NoticePayload {
  const title = payload.title.trim();

  if (!title) {
    throw new Error("Title is required");
  }

  return {
    ...payload,
    title,
    targetUserId: payload.targetType === "SINGLE_EMPLOYEE" ? payload.targetUserId : undefined,
    targetBranchId: payload.targetType === "SINGLE_BRANCH" ? payload.targetBranchId : undefined,
  };
}

function revalidateNoticePaths() {
  revalidatePath("/admin/notices");
  revalidatePath("/manager/notices");
  revalidatePath("/dashboard");
  revalidatePath("/notices");
}

async function resolveTargetSummary(payload: NoticePayload): Promise<string> {
  if (payload.targetType === "ALL_EMPLOYEES") {
    return "all employees";
  }

  if (payload.targetType === "SINGLE_EMPLOYEE") {
    if (!payload.targetUserId) {
      return "one employee";
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: payload.targetUserId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!targetUser) {
      return "one employee";
    }

    const name = [targetUser.firstName, targetUser.lastName].filter(Boolean).join(" ").trim();
    return name ? `employee ${name}` : `employee ${targetUser.email}`;
  }

  if (!payload.targetBranchId) {
    return "one branch";
  }

  const branch = await prisma.branch.findUnique({
    where: { id: payload.targetBranchId },
    select: { name: true },
  });

  return branch ? `branch ${branch.name}` : "one branch";
}

export async function getBreakingNoticeFormOptions() {
  const user = await getDbUser();
  if (!canManageNotices(user)) {
    throw new Error("Unauthorized");
  }

  const [branches, employees] = await Promise.all([
    prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        role: "EMPLOYEE",
        status: "APPROVED",
        isArchived: false,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
    }),
  ]);

  return { branches, employees };
}

export async function createBreakingNotice(payload: NoticePayload) {
  try {
    const user = await getDbUser();
    if (!user || !canManageNotices(user)) {
      return { success: false, error: "Unauthorized" };
    }

    const normalized = normalizePayload(payload);
    const recipientIds = await resolveRecipientIds(normalized);

    if (recipientIds.length === 0) {
      return { success: false, error: "No eligible recipients found for this notice target" };
    }

    const createdNotice = await prisma.$transaction(async (tx) => {
      const notice = await tx.breakingNotice.create({
        data: {
          title: normalized.title,
          targetType: normalized.targetType as BreakingNoticeTargetType,
          senderId: user.id,
          targetUserId: normalized.targetUserId,
          targetBranchId: normalized.targetBranchId,
        },
      });

      await tx.breakingNoticeRecipient.createMany({
        data: recipientIds.map((recipientId) => ({
          noticeId: notice.id,
          userId: recipientId,
          noticeVersion: notice.version,
        })),
      });

      return notice;
    });

    if (user.role === "EMPLOYEE" && user.isManager) {
      const creatorName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
      const targetSummary = await resolveTargetSummary(normalized);

      await createAdminNotification({
        type: "SYSTEM_ALERT",
        title: "Manager Notice Created",
        message: `${creatorName} created a notice for ${targetSummary}.`,
        metadata: {
          feature: "BREAKING_NOTICE",
          noticeId: createdNotice.id,
          createdBy: creatorName,
          targetType: normalized.targetType,
          targetSummary,
        },
      });
    }

    revalidateNoticePaths();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create notice";
    return { success: false, error: message };
  }
}

export async function updateBreakingNotice(noticeId: string, payload: NoticePayload) {
  try {
    const user = await getDbUser();
    if (!user || !canManageNotices(user)) {
      return { success: false, error: "Unauthorized" };
    }

    const existingNotice = await prisma.breakingNotice.findUnique({
      where: { id: noticeId },
      select: { id: true, version: true },
    });

    if (!existingNotice) {
      return { success: false, error: "Notice not found" };
    }

    const normalized = normalizePayload(payload);
    const recipientIds = await resolveRecipientIds(normalized);

    if (recipientIds.length === 0) {
      return { success: false, error: "No eligible recipients found for this notice target" };
    }

    const nextVersion = existingNotice.version + 1;

    await prisma.$transaction(async (tx) => {
      await tx.breakingNotice.update({
        where: { id: noticeId },
        data: {
          title: normalized.title,
          targetType: normalized.targetType as BreakingNoticeTargetType,
          targetUserId: normalized.targetUserId,
          targetBranchId: normalized.targetBranchId,
          version: nextVersion,
          isEdited: true,
        },
      });

      const existingRecipients = await tx.breakingNoticeRecipient.findMany({
        where: { noticeId },
        select: { userId: true },
      });

      const existingRecipientIds = new Set(existingRecipients.map((item) => item.userId));
      const incomingRecipientIds = new Set(recipientIds);

      const usersToDelete = Array.from(existingRecipientIds).filter((id) => !incomingRecipientIds.has(id));
      const usersToCreate = recipientIds.filter((id) => !existingRecipientIds.has(id));

      if (usersToDelete.length > 0) {
        await tx.breakingNoticeRecipient.deleteMany({
          where: {
            noticeId,
            userId: { in: usersToDelete },
          },
        });
      }

      await tx.breakingNoticeRecipient.updateMany({
        where: {
          noticeId,
          userId: { in: recipientIds },
        },
        data: {
          status: false,
          seenAt: null,
          visibleUntil: null,
          noticeVersion: nextVersion,
        },
      });

      if (usersToCreate.length > 0) {
        await tx.breakingNoticeRecipient.createMany({
          data: usersToCreate.map((recipientId) => ({
            noticeId,
            userId: recipientId,
            noticeVersion: nextVersion,
          })),
        });
      }
    });

    if (user.role === "EMPLOYEE" && user.isManager) {
      const editorName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
      const targetSummary = await resolveTargetSummary(normalized);

      await createAdminNotification({
        type: "SYSTEM_ALERT",
        title: "Manager Notice Updated",
        message: `${editorName} edited a notice for ${targetSummary}.`,
        metadata: {
          feature: "BREAKING_NOTICE",
          noticeId,
          updatedBy: editorName,
          action: "edit",
          targetType: normalized.targetType,
          targetSummary,
        },
      });
    }

    revalidateNoticePaths();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update notice";
    return { success: false, error: message };
  }
}

export async function deleteBreakingNotice(noticeId: string) {
  try {
    const user = await getDbUser();
    if (!user || !canManageNotices(user)) {
      return { success: false, error: "Unauthorized" };
    }

    await prisma.breakingNotice.delete({
      where: { id: noticeId },
    });

    revalidateNoticePaths();
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete notice" };
  }
}

export async function getBreakingNoticeHistory() {
  const user = await getDbUser();
  if (!canManageNotices(user)) {
    throw new Error("Unauthorized");
  }

  const notices = await prisma.breakingNotice.findMany({
    include: {
      sender: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      targetUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      targetBranch: {
        select: {
          id: true,
          name: true,
        },
      },
      recipients: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              branch: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [
          { status: "asc" },
          { seenAt: "desc" },
          { createdAt: "asc" },
        ],
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return notices;
}

export async function getEmployeeActiveBreakingNotices() {
  const user = await getDbUser();
  if (!user || user.role !== "EMPLOYEE") {
    return [];
  }

  const now = new Date();
  const visibilityEnd = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  const recipientRows = await prisma.breakingNoticeRecipient.findMany({
    where: { userId: user.id },
    include: {
      notice: {
        select: {
          id: true,
          version: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const rowsNeedingVersionReset = recipientRows.filter(
    (row) => row.noticeVersion !== row.notice.version
  );

  if (rowsNeedingVersionReset.length > 0) {
    await prisma.$transaction(
      rowsNeedingVersionReset.map((row) =>
        prisma.breakingNoticeRecipient.update({
          where: { id: row.id },
          data: {
            status: false,
            seenAt: null,
            visibleUntil: null,
            noticeVersion: row.notice.version,
          },
        })
      )
    );
  }

  const refreshedRows = await prisma.breakingNoticeRecipient.findMany({
    where: { userId: user.id },
    include: {
      notice: {
        select: {
          id: true,
          title: true,
          isEdited: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const unseenRows = refreshedRows.filter((row) => !row.status);

  if (unseenRows.length > 0) {
    await prisma.$transaction(
      unseenRows.map((row) =>
        prisma.breakingNoticeRecipient.update({
          where: { id: row.id },
          data: {
            status: true,
            seenAt: now,
            visibleUntil: visibilityEnd,
          },
        })
      )
    );
  }

  const finalRows = await prisma.breakingNoticeRecipient.findMany({
    where: {
      userId: user.id,
      status: true,
      visibleUntil: { gt: now },
    },
    include: {
      notice: {
        select: {
          id: true,
          title: true,
          isEdited: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: {
      seenAt: "desc",
    },
  });

  return finalRows.map((row) => ({
    id: row.notice.id,
    title: row.notice.title,
    isEdited: row.notice.isEdited,
    seenStatus: row.status,
    seenAt: row.seenAt,
    visibleUntil: row.visibleUntil,
    createdAt: row.notice.createdAt,
    updatedAt: row.notice.updatedAt,
  }));
}

export async function getEmployeeAllBreakingNotices() {
  const user = await getDbUser();
  if (!user || user.role !== "EMPLOYEE") {
    return [];
  }

  const recipientRows = await prisma.breakingNoticeRecipient.findMany({
    where: { userId: user.id },
    include: {
      notice: {
        select: {
          id: true,
          title: true,
          isEdited: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return recipientRows.map((row) => ({
    id: row.notice.id,
    title: row.notice.title,
    isEdited: row.notice.isEdited,
    createdAt: row.notice.createdAt,
    updatedAt: row.notice.updatedAt,
  }));
}
