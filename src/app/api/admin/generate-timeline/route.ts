import { NextResponse } from 'next/server';
import { checkAndGenerateToday } from '@/actions/timeline.actions';

// Manual trigger endpoint for testing timeline generation
export async function POST() {
  try {
    console.log('Manual timeline generation triggered for today:', new Date().toISOString());

    const result = await checkAndGenerateToday();

    if (result.success) {
      console.log('Manual timeline generation completed successfully:', result.message);
      return NextResponse.json({
        success: true,
        message: result.message,
        recordsCreated: result.recordsCreated || 0,
        timestamp: new Date().toISOString(),
        manual: true
      });
    } else {
      console.error('Manual timeline generation failed:', result.error);
      return NextResponse.json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString(),
        manual: true
      }, { status: 500 });
    }

  } catch (error) {
    const errorMessage = `Manual timeline generation failed: ${error}`;
    console.error(errorMessage);

    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      manual: true
    }, { status: 500 });
  }
}

// GET method for easy browser testing
export async function GET() {
  return POST();
}