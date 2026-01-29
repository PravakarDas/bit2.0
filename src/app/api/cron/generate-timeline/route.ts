import { NextRequest, NextResponse } from 'next/server';
import { checkAndGenerateToday } from '@/actions/timeline.actions';
import { createAdminNotification } from '@/actions/notification.actions';

// This endpoint should be called daily at 00:01
export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request (optional security)
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET_TOKEN;
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting daily timeline generation...');
    
    // Check and generate today's timeline records (includes backfill logic)
    const result = await checkAndGenerateToday();
    
    const response = {
      success: result.success,
      message: result.message || result.error,
      recordsCreated: result.recordsCreated || 0,
      timestamp: new Date().toISOString()
    };

    // If there were failures, return error status
    if (!result.success) {
      // Send notification to admin about the failure  
      await createAdminNotification({
        type: 'TIMELINE_GENERATION_FAILED',
        title: 'Timeline Generation Failed',
        message: `Daily timeline generation failed on ${new Date().toDateString()}. Error: ${result.error}`
      });
      
      return NextResponse.json(response, { status: 500 });
    }

    return NextResponse.json(response, { status: 200 });
    
  } catch (error) {
    console.error('Error in daily timeline generation:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error', 
        details: error,
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    );
  }
}

// Allow GET for testing purposes
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }
  
  return POST(request);
}