import { NextResponse } from 'next/server';
import { checkAndCreateIncrementReminders } from '@/actions/notification.actions';

// This endpoint can be called by a cron job service (like Vercel Cron, GitHub Actions, or external cron)
export async function GET() {
  try {
    console.log('Running daily notification check...');
    
    const result = await checkAndCreateIncrementReminders();
    
    if (result.success) {
      console.log(`Created ${result.remindersCreated.length} increment reminders`);
      return NextResponse.json({
        success: true,
        message: `Created ${result.remindersCreated.length} increment reminders`,
        reminders: result.remindersCreated
      });
    } else {
      console.error('Failed to check increment reminders:', result.error);
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in daily notification check:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// Optional: Allow POST for manual triggering
export async function POST() {
  return GET(); // Same logic as GET
}