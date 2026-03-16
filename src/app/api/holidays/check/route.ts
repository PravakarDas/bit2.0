import { NextRequest, NextResponse } from "next/server";
import { checkAllHolidays } from "@/actions/leave.actions";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const userId = searchParams.get('userId');
        
        if (!date || !userId) {
            return NextResponse.json({ 
                error: 'Both date and userId parameters are required' 
            }, { status: 400 });
        }
        
        const result = await checkAllHolidays(userId, date);
        return NextResponse.json(result);
    } catch (error) {
        console.error("Error checking holidays:", error); 
        return NextResponse.json(
            { error: 'Internal server error' }, 
            { status: 500 }
        );
    }
}