import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/actions/user.actions";
import { prisma } from "@/lib/prisma";

function assertCanAccessEmployeeNotes(user: any) {
  if (!user) throw new Error("Unauthorized");
  const isAdmin = user.role === "SUPERADMIN";
  const isManager = user.role === "EMPLOYEE" && user.isManager;
  if (!isAdmin && !isManager) throw new Error("Unauthorized");
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const employeeId = url.searchParams.get("employeeId");

    const user = await getDbUser();
    assertCanAccessEmployeeNotes(user);

    if (!employeeId) {
      return NextResponse.json({ error: "employeeId required" }, { status: 400 });
    }

    const notes = await prisma.employeeNote.findMany({
      where: { employeeId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        createdByUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return NextResponse.json({ notes });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId, note } = body;

    const user = await getDbUser();
    assertCanAccessEmployeeNotes(user);

    if (!employeeId || typeof note !== "string") {
      return NextResponse.json({ error: "employeeId and note required" }, { status: 400 });
    }

    const created = await prisma.employeeNote.create({
      data: {
        employeeId,
        note,
        createdBy: user!.id,
      },
      include: {
        createdByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return NextResponse.json({ note: created });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    const user = await getDbUser();
    assertCanAccessEmployeeNotes(user);

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    // Soft-delete by setting deletedAt
    const existing = await prisma.employeeNote.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    await prisma.employeeNote.update({ where: { id }, data: { deletedAt: new Date() } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
