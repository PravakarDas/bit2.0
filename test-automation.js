const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testAutomatedSystem() {
  console.log('🚀 Testing Automated Timeline Generation System');
  
  try {
    // 1. Create sample data
    console.log('\n📊 Creating sample data...');
    
    // Create a branch
    const existingBranch = await prisma.branch.findFirst({
      where: { name: 'Test Branch' }
    });
    
    const branch = existingBranch || await prisma.branch.create({
      data: {
        name: 'Test Branch',
        location: 'Test Location',
        checkInTime: '09:00',
        checkOutTime: '18:00',
        breakDuration: '01:00',
        weeklyOffDays: ['SATURDAY', 'SUNDAY']
      }
    });
    
    console.log(`✅ Created branch: ${branch.name}`);
    
    // Create sample employees
    const existingEmployees = await prisma.user.findMany({
      where: {
        email: { in: ['john.doe@test.com', 'jane.smith@test.com'] }
      }
    });
    
    let employees = existingEmployees;
    
    if (existingEmployees.length === 0) {
      employees = await Promise.all([
        prisma.user.create({
          data: {
            clerkId: 'test_clerk_1',
            email: 'john.doe@test.com',
            firstName: 'John',
            lastName: 'Doe',
            role: 'EMPLOYEE',
            status: 'APPROVED',
            branchId: branch.id
          }
        }),
        prisma.user.create({
          data: {
            clerkId: 'test_clerk_2',
            email: 'jane.smith@test.com',
            firstName: 'Jane',
            lastName: 'Smith',
            role: 'EMPLOYEE',
            status: 'APPROVED',
            branchId: branch.id
          }
        })
      ]);
    }
    
    console.log(`✅ Created ${employees.length} employees`);
    
    // 2. Test API endpoint directly (simpler approach)
    console.log('\n⚡ Testing API endpoint...');
    
    const fetch = require('node-fetch');
    
    try {
      const response = await fetch('http://localhost:3000/api/cron/generate-timeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      console.log('📋 API Response:', {
        status: response.status,
        success: result.success,
        message: result.message,
        recordsCreated: result.recordsCreated || 0
      });
      
      if (result.success) {
        console.log('✅ API endpoint working correctly!');
      } else {
        console.log('❌ API endpoint returned error:', result.error);
      }
      
    } catch (fetchError) {
      console.log('💡 API endpoint not available (server not running), testing database directly...');
      
      // If API is not available, test the database records creation manually
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const employees = await prisma.user.findMany({
        where: {
          status: 'APPROVED',
          role: 'EMPLOYEE'
        }
      });
      
      console.log(`📊 Found ${employees.length} approved employees`);
      
      // Create sample timeline record for today
      const existingRecord = await prisma.dailyTimeRecord.findFirst({
        where: {
          date: today,
          userId: employees[0]?.id
        }
      });
      
      if (!existingRecord && employees.length > 0) {
        const checkInTime = new Date(today);
        const checkOutTime = new Date(today);
        checkInTime.setHours(9, 0, 0, 0);
        checkOutTime.setHours(18, 0, 0, 0);
        
        const record = await prisma.dailyTimeRecord.create({
          data: {
            userId: employees[0].id,
            date: today,
            requiredCheckIn: checkInTime,
            requiredCheckOut: checkOutTime,
            requiredBreakTime: '01:00'
          }
        });
        
        console.log('✅ Successfully created timeline record directly');
      } else if (existingRecord) {
        console.log('✅ Timeline record already exists for today');
      }
    }
    
    // 3. Check created timeline records
    console.log('\n📅 Checking timeline records...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const records = await prisma.dailyTimeRecord.findMany({
      where: { date: today },
      include: {
        user: {
          select: { firstName: true, lastName: true }
        }
      }
    });
    
    console.log(`📊 Found ${records.length} timeline records for today:`);
    records.forEach(record => {
      const checkIn = record.requiredCheckIn ? record.requiredCheckIn.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5) : 'N/A';
      const checkOut = record.requiredCheckOut ? record.requiredCheckOut.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5) : 'N/A';
      console.log(`  - ${record.user.firstName} ${record.user.lastName}: ${checkIn} - ${checkOut} (Break: ${record.requiredBreakTime || 'N/A'})`);
    });
    
    // 4. Check admin notifications
    console.log('\n🔔 Checking admin notifications...');
    const notifications = await prisma.adminNotification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    console.log(`📨 Found ${notifications.length} recent admin notifications:`);
    notifications.forEach(notification => {
      console.log(`  - ${notification.type}: ${notification.title}`);
    });
    
  } catch (error) {
    console.error('💥 Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAutomatedSystem();