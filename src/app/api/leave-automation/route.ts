import { NextResponse } from 'next/server';
import { processBackfillLeaveAutomation, runLeaveAutomationPipeline } from '@/actions/leave-automation.actions';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const backfillDays = searchParams.get('backfill');
        
        let result;
        
        if (backfillDays) {
            if (backfillDays === 'all') {
                const earliestRecord = await prisma.dailyTimeRecord.findFirst({
                    orderBy: { date: 'asc' },
                    select: { date: true }
                });

                const earliestByJoinDate = await prisma.user.findFirst({
                    where: {
                        employeeStatus: 'ACTIVE',
                        isArchived: false,
                        branchId: { not: null },
                        dateOfJoining: { not: null }
                    },
                    orderBy: { dateOfJoining: 'asc' },
                    select: { dateOfJoining: true }
                });

                const earliestByCreatedAt = await prisma.user.findFirst({
                    where: {
                        employeeStatus: 'ACTIVE',
                        isArchived: false,
                        branchId: { not: null }
                    },
                    orderBy: { createdAt: 'asc' },
                    select: { createdAt: true }
                });

                const earliestDate = earliestRecord?.date
                    || earliestByJoinDate?.dateOfJoining
                    || earliestByCreatedAt?.createdAt;
                const fromDate = earliestDate ? new Date(earliestDate) : new Date(0);

                result = await runLeaveAutomationPipeline({
                    mode: 'ALL_DATES',
                    fromDate,
                    includeToday: true,
                    skipIfWithinWindow: true,
                    now: new Date(),
                });
            } else {
                // Process backfill for specified number of days
                const days = parseInt(backfillDays);
                const fromDate = new Date();
                fromDate.setDate(fromDate.getDate() - days);

                result = await processBackfillLeaveAutomation(fromDate);
            }
        } else {
            // Sync missing ZKTeco data, then process all unprocessed dates (including today and yesterday)
            result = await runLeaveAutomationPipeline({ mode: 'UNPROCESSED' });
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