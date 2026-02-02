"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Type for profile data
export type ProfileData = {
  // Personal Information
  gender?: string | null;
  dateOfBirth?: Date | null;
  bloodGroup?: string | null;
  nidNumber?: string | null;

  // Contact Information
  phoneNumber?: string | null;
  personalEmail?: string | null;

  // Current Address
  currentStreet?: string | null;
  currentCity?: string | null;
  currentState?: string | null;
  currentCountry?: string | null;
  currentPostalCode?: string | null;

  // Permanent Address
  permanentStreet?: string | null;
  permanentCity?: string | null;
  permanentState?: string | null;
  permanentCountry?: string | null;
  permanentPostalCode?: string | null;

  // Employment Details
  dateOfJoining?: Date | null;
  attendanceId?: string | null;

  // Emergency Contact
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactEmail?: string | null;
  emergencyContactAddress?: string | null;

  // Banking Information
  bankAccountNumber?: string | null;

  // Professional Links
  portfolioLink?: string | null;
  githubLink?: string | null;
  linkedinLink?: string | null;
};

/**
 * Get current user's profile information
 */
export async function getCurrentUserProfile() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { clerkId },
      include: {
        branch: true,
        department: true,
        designation: true,
      },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    return { success: true, data: user };
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return { success: false, error: "Failed to fetch profile" };
  }
}

/**
 * Get profile information for a specific user by ID (admin only)
 */
export async function getUserProfileById(userId: string) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const currentUserData = await prisma.user.findUnique({
      where: { clerkId },
      select: { role: true },
    });

    // Check if user is admin
    if (!currentUserData || !["SUPERADMIN", "HR", "MANAGER"].includes(currentUserData.role)) {
      return { success: false, error: "Unauthorized access" };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        branch: true,
        department: true,
        designation: true,
      },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    return { success: true, data: user };
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return { success: false, error: "Failed to fetch profile" };
  }
}

/**
 * Submit a profile update request (Employee)
 * This creates a pending request that requires admin approval
 */
export async function submitProfileUpdateRequest(data: ProfileData) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Get current values for audit trail
    const currentValues: Partial<ProfileData> = {
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      bloodGroup: user.bloodGroup,
      nidNumber: user.nidNumber,
      phoneNumber: user.phoneNumber,
      personalEmail: user.personalEmail,
      currentStreet: user.currentStreet,
      currentCity: user.currentCity,
      currentState: user.currentState,
      currentCountry: user.currentCountry,
      currentPostalCode: user.currentPostalCode,
      permanentStreet: user.permanentStreet,
      permanentCity: user.permanentCity,
      permanentState: user.permanentState,
      permanentCountry: user.permanentCountry,
      permanentPostalCode: user.permanentPostalCode,
      dateOfJoining: user.dateOfJoining,
      attendanceId: user.attendanceId,
      emergencyContactName: user.emergencyContactName,
      emergencyContactRelationship: user.emergencyContactRelationship,
      emergencyContactPhone: user.emergencyContactPhone,
      emergencyContactEmail: user.emergencyContactEmail,
      emergencyContactAddress: user.emergencyContactAddress,
      bankAccountNumber: user.bankAccountNumber,
      portfolioLink: user.portfolioLink,
      githubLink: user.githubLink,
      linkedinLink: user.linkedinLink,
    };

    // Create update request
    const updateRequest = await prisma.profileUpdateRequest.create({
      data: {
        userId: user.id,
        requestedChanges: data,
        previousValues: currentValues,
        status: "PENDING",
      },
    });

    // Create notification for admins
    await prisma.adminNotification.create({
      data: {
        type: "PROFILE_UPDATE_REQUEST",
        title: "New Profile Update Request",
        message: `${user.firstName} ${user.lastName} has submitted a profile update request`,
        metadata: {
          requestId: updateRequest.id,
          userId: user.id,
          userName: `${user.firstName} ${user.lastName}`,
        },
      },
    });

    revalidatePath("/admin/profile-requests");

    return { success: true, data: updateRequest };
  } catch (error) {
    console.error("Error submitting profile update request:", error);
    return { success: false, error: "Failed to submit update request" };
  }
}

/**
 * Update user profile directly (Admin only)
 * Admins can update employee profiles without approval workflow
 */
export async function updateUserProfileByAdmin(userId: string, data: ProfileData) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const currentUserData = await prisma.user.findUnique({
      where: { clerkId },
      select: { role: true },
    });

    // Check if user is admin
    if (!currentUserData || !["SUPERADMIN", "HR", "MANAGER"].includes(currentUserData.role)) {
      return { success: false, error: "Unauthorized access" };
    }

    // Convert dates from strings if needed
    const updateData = { ...data };
    if (updateData.dateOfBirth && typeof updateData.dateOfBirth === "string") {
      updateData.dateOfBirth = new Date(updateData.dateOfBirth);
    }
    if (updateData.dateOfJoining && typeof updateData.dateOfJoining === "string") {
      updateData.dateOfJoining = new Date(updateData.dateOfJoining);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    revalidatePath(`/admin/employees/${userId}`);
    revalidatePath("/admin/employees");

    return { success: true, data: updatedUser };
  } catch (error) {
    console.error("Error updating user profile:", error);
    return { success: false, error: "Failed to update profile" };
  }
}

/**
 * Get all pending profile update requests (Admin only)
 */
export async function getPendingProfileUpdateRequests() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const currentUserData = await prisma.user.findUnique({
      where: { clerkId },
      select: { role: true },
    });

    if (!currentUserData || !["SUPERADMIN", "HR", "MANAGER"].includes(currentUserData.role)) {
      return { success: false, error: "Unauthorized access" };
    }

    const requests = await prisma.profileUpdateRequest.findMany({
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
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: requests };
  } catch (error) {
    console.error("Error fetching profile update requests:", error);
    return { success: false, error: "Failed to fetch requests" };
  }
}

/**
 * Get all profile update requests for current user
 */
export async function getMyProfileUpdateRequests() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const requests = await prisma.profileUpdateRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: requests };
  } catch (error) {
    console.error("Error fetching profile update requests:", error);
    return { success: false, error: "Failed to fetch requests" };
  }
}

/**
 * Approve profile update request (Admin only)
 */
export async function approveProfileUpdateRequest(requestId: string, reviewNotes?: string) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const currentUserData = await prisma.user.findUnique({
      where: { clerkId },
      select: { role: true },
    });

    if (!currentUserData || !["SUPERADMIN", "HR", "MANAGER"].includes(currentUserData.role)) {
      return { success: false, error: "Unauthorized access" };
    }

    // Get the request
    const request = await prisma.profileUpdateRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!request) {
      return { success: false, error: "Request not found" };
    }

    if (request.status !== "PENDING") {
      return { success: false, error: "Request has already been processed" };
    }

    // Apply the changes to the user
    const requestedChanges = request.requestedChanges as ProfileData;

    // Convert dates from strings if needed
    const updateData = { ...requestedChanges };
    if (updateData.dateOfBirth && typeof updateData.dateOfBirth === "string") {
      updateData.dateOfBirth = new Date(updateData.dateOfBirth);
    }
    if (updateData.dateOfJoining && typeof updateData.dateOfJoining === "string") {
      updateData.dateOfJoining = new Date(updateData.dateOfJoining);
    }

    // Update user and request in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: request.userId },
        data: updateData,
      }),
      prisma.profileUpdateRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          reviewedBy: clerkId,
          reviewedAt: new Date(),
          reviewNotes,
        },
      }),
    ]);

    revalidatePath("/admin/profile-requests");
    revalidatePath(`/admin/employees/${request.userId}`);

    return { success: true, message: "Profile update request approved successfully" };
  } catch (error) {
    console.error("Error approving profile update request:", error);
    return { success: false, error: "Failed to approve request" };
  }
}

/**
 * Reject profile update request (Admin only)
 */
export async function rejectProfileUpdateRequest(requestId: string, reviewNotes: string) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const currentUserData = await prisma.user.findUnique({
      where: { clerkId },
      select: { role: true },
    });

    if (!currentUserData || !["SUPERADMIN", "HR", "MANAGER"].includes(currentUserData.role)) {
      return { success: false, error: "Unauthorized access" };
    }

    const request = await prisma.profileUpdateRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return { success: false, error: "Request not found" };
    }

    if (request.status !== "PENDING") {
      return { success: false, error: "Request has already been processed" };
    }

    await prisma.profileUpdateRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        reviewedBy: clerkId,
        reviewedAt: new Date(),
        reviewNotes,
      },
    });

    revalidatePath("/admin/profile-requests");

    return { success: true, message: "Profile update request rejected" };
  } catch (error) {
    console.error("Error rejecting profile update request:", error);
    return { success: false, error: "Failed to reject request" };
  }
}
