const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testTimelineGeneration() {
  console.log('🧪 Testing Timeline Generation for Jan 29, 2026');
  
  try {
    // 1. Check for approved employees
    console.log('\n📊 Checking for approved employees...');
    const approvedEmployees = await prisma.user.findMany({
      where: {
        status: 'APPROVED',
        role: 'EMPLOYEE'
      },
      include: {
        branch: true
      }
    });

    console.log(`✅ Found ${approvedEmployees.length} approved employees:`);
    approvedEmployees.forEach(emp => {
      console.log(`  - ${emp.firstName} ${emp.lastName} (${emp.email}) - Branch: ${emp.branch?.name || 'No Branch'}`);
    });

    if (approvedEmployees.length === 0) {
      console.log('❌ No approved employees found! Creating test data...');
      
      // Create test branch if it doesn't exist
      const testBranch = await prisma.branch.upsert({
        where: { name: 'Test Branch' },
        update: {},
        create: {
          name: 'Test Branch',
          location: 'Test Location',
          checkInTime: '09:00',
          checkOutTime: '18:00',
          breakDuration: '01:00',
          weeklyOffDays: ['SATURDAY', 'SUNDAY']
        }
      });

      // Create test employees
      const testEmployees = await Promise.all([
        prisma.user.upsert({
          where: { email: 'test.emp1@company.com' },
          update: { status: 'APPROVED' },
          create: {
            clerkId: `test_clerk_${Date.now()}_1`,
            email: 'test.emp1@company.com',
            firstName: 'John',
            lastName: 'Doe',
            role: 'EMPLOYEE',
            status: 'APPROVED',
            branchId: testBranch.id
          }
        }),
        prisma.user.upsert({
          where: { email: 'test.emp2@company.com' },
          update: { status: 'APPROVED' },
          create: {
            clerkId: `test_clerk_${Date.now()}_2`,
            email: 'test.emp2@company.com',
            firstName: 'Jane',
            lastName: 'Smith',
            role: 'EMPLOYEE',
            status: 'APPROVED',
            branchId: testBranch.id
          }
        })
      ]);

      console.log(`✅ Created ${testEmployees.length} test employees`);
    }

    // 2. Check existing timeline records for today
    console.log('\n📅 Checking existing timeline records for today...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingRecords = await prisma.dailyTimeRecord.findMany({
      where: { date: today },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true }
        }
      }
    });

    console.log(`📊 Found ${existingRecords.length} existing records for today:`);
    existingRecords.forEach(record => {
      console.log(`  - ${record.user.firstName} ${record.user.lastName}: ${record.requiredCheckIn ? 'Has schedule' : 'No schedule'}`);
    });

    // 3. Test timeline generation function
    console.log('\n⚡ Testing timeline generation function...');
    const { checkAndGenerateToday } = require('./src/actions/timeline.actions.ts');
    
    try {
      const result = await checkAndGenerateToday();
      console.log('📋 Generation Result:', {
        success: result.success,
        message: result.message,
        recordsCreated: result.recordsCreated || 0,
        error: result.error || 'None'
      });
      
      if (result.success) {
        console.log('✅ Timeline generation function works correctly!');
      } else {
        console.log('❌ Timeline generation failed:', result.error);
      }
    } catch (err) {
      console.log('❌ Error calling timeline generation function:', err.message);
      console.log('💡 This might be a module import issue - the API endpoint should work instead');
    }

    // 4. Check final state
    console.log('\n📊 Final check - timeline records after generation...');
    const finalRecords = await prisma.dailyTimeRecord.findMany({
      where: { date: today },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true }
        }
      }
    });

    console.log(`📊 Total records for today: ${finalRecords.length}`);
    finalRecords.forEach(record => {
      const checkIn = record.requiredCheckIn ? record.requiredCheckIn.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5) : 'N/A';
      const checkOut = record.requiredCheckOut ? record.requiredCheckOut.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5) : 'N/A';
      console.log(`  - ${record.user.firstName} ${record.user.lastName}: ${checkIn} - ${checkOut}`);
    });

  } catch (error) {
    console.error('💥 Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testTimelineGeneration();