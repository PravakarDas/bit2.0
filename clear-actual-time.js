import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearActualTime() {
  try {
    console.log('Clearing all actual time from timeline records...');
    
    const result = await prisma.dailyTimeRecord.updateMany({
      data: {
        actualCheckIn: null,
        actualCheckOut: null,
        actualBreakTime: null,
        actualActiveTime: null,
        officialOvertimeundertime: null,
        isProcessed: false,
      },
    });
    
    console.log(`Successfully cleared actual time from ${result.count} timeline records`);
    console.log('Actual time fields have been reset to NULL');
    console.log('Records are now ready for new attendance data to be synced');
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error clearing actual time:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

clearActualTime();
