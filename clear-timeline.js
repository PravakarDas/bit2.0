const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function clearTimelineData() {
  try {
    console.log('Deleting all timeline records...');
    const result = await prisma.dailyTimeRecord.deleteMany({});
    console.log(`Successfully deleted ${result.count} timeline records`);
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error deleting timeline records:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

clearTimelineData();