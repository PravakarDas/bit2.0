import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "@/actions/user.actions";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const user = await getUserById(id);
        
        if (!user) {
            return NextResponse.json({ error: "Employee not found" }, { status: 404 });
        }

        const name = user.firstName && user.lastName 
            ? `${user.firstName} ${user.lastName}`
            : user.email;

        return NextResponse.json({ name });
    } catch (error) {
        console.error("Error fetching employee name:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}