import { NextResponse } from 'next/server';
import { processBackfillLeaveAutomation, runLeaveAutomationPipeline } from '@/actions/leave-automation.actions';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const backfillDays = searchParams.get('backfill');
        const employeeId = searchParams.get('employeeId')?.trim() || undefined;
        
        let result;
        
        if (backfillDays) {
            if (backfillDays === 'all') {
                    const fromDate = new Date(new Date().getFullYear(), 0, 1);

                    result = await runLeaveAutomationPipeline({
                        mode: 'ALL_DATES',
                        fromDate,
                        includeToday: true,
                        skipIfWithinWindow: true,
                        now: new Date(),
                        employeeIds: employeeId ? [employeeId] : undefined,
                    });
            } else {
                // Process backfill for specified number of days
                const days = parseInt(backfillDays);
                const fromDate = new Date();
                fromDate.setDate(fromDate.getDate() - days);

                result = await processBackfillLeaveAutomation(fromDate, undefined, undefined, employeeId ? [employeeId] : undefined);
            }
        } else {
            // Sync missing ZKTeco data, then process all unprocessed dates (excluding today)
            result = await runLeaveAutomationPipeline({
                mode: 'UNPROCESSED',
                employeeIds: employeeId ? [employeeId] : undefined,
                skipIfWithinWindow: true,
                skipToday: true,
                now: new Date(),
            });
        }
        const resultSuccess = typeof result === 'object' && result !== null && 'success' in result
            ? Boolean((result as { success?: boolean }).success)
            : true;

        if (!resultSuccess) {
            const syncMessage = typeof result === 'object'
                && result !== null
                && 'sync' in result
                && typeof (result as { sync?: { message?: string } }).sync?.message === 'string'
                ? (result as { sync?: { message?: string } }).sync?.message
                : undefined;

            return NextResponse.json(
                {
                    success: false,
                    error: syncMessage || 'Leave automation processing failed',
                    data: result,
                },
                { status: 503 }
            );
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