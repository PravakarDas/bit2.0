import { NextResponse } from 'next/server';
import { processDailyLeaveAutomation, processBackfillLeaveAutomation } from '@/actions/leave-automation.actions';

export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const backfillDays = searchParams.get('backfill');
        
        let result;
        
        if (backfillDays) {
            // Process backfill for specified number of days
            const days = parseInt(backfillDays);
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - days);
            
            result = await processBackfillLeaveAutomation(fromDate);
        } else {
            // Process yesterday's records
            result = await processDailyLeaveAutomation();
        }
        
        return NextResponse.json({
            success: true,
            message: 'Leave automation processing completed',
            data: result
        });
        
    } catch (error) {
        console.error('Leave automation API error:', error);
        return NextResponse.json(
            { 
                success: false, 
                error: 'Failed to process leave automation' 
            },
            { status: 500 }
        );
    }
}

// GET endpoint to check system status
export async function GET() {
    return NextResponse.json({
        success: true,
        message: 'Leave automation system is running',
        timestamp: new Date().toISOString()
    });
}