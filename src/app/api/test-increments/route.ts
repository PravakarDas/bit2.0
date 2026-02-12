// Test script to check increment reminders and employee data
// Run this by visiting /api/test-increments in your browser

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EmployeeStatus } from '@prisma/client';

export async function GET() {
  try {
    console.log('=== Testing Increment Reminders ===');
    
    const today = new Date();
    console.log('Today:', today.toDateString());
    
    const oneWeekFromToday = new Date(today);
    oneWeekFromToday.setDate(today.getDate() + 7);
    console.log('One week from today:', oneWeekFromToday.toDateString());
    
    // Get all active employees
    const employees = await prisma.user.findMany({
      where: {
        employeeStatus: EmployeeStatus.ACTIVE,
        dateOfJoining: { not: null }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        dateOfJoining: true
      }
    });

    console.log(`Found ${employees.length} active employees with joining dates`);
    
    const eligibleEmployees = [];

    for (const employee of employees) {
      if (!employee.dateOfJoining) continue;

      const joiningDate = new Date(employee.dateOfJoining);
      const currentYear = today.getFullYear();
      
      // Calculate this year's anniversary
      const thisYearAnniversary = new Date(currentYear, joiningDate.getMonth(), joiningDate.getDate());
      
      // If this year's anniversary has passed, calculate next year's anniversary
      const anniversaryDate = thisYearAnniversary < today 
        ? new Date(currentYear + 1, joiningDate.getMonth(), joiningDate.getDate())
        : thisYearAnniversary;
      
      // Check days until anniversary
      const daysDifference = Math.ceil((anniversaryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      const employeeInfo = {
        name: `${employee.firstName} ${employee.lastName}`,
        joiningDate: joiningDate.toDateString(),
        anniversaryDate: anniversaryDate.toDateString(),
        daysDifference,
        eligible: daysDifference === 7
      };
      
      console.log(`Employee: ${employeeInfo.name}`);
      console.log(`  - Joined: ${employeeInfo.joiningDate}`);
      console.log(`  - Next Anniversary: ${employeeInfo.anniversaryDate}`);
      console.log(`  - Days until anniversary: ${employeeInfo.daysDifference}`);
      console.log(`  - Eligible for reminder: ${employeeInfo.eligible}`);
      console.log('---');
      
      if (daysDifference === 7) {
        eligibleEmployees.push(employeeInfo);
      }
    }

    // Check existing notifications
    const existingNotifications = await prisma.adminNotification.findMany({
      where: {
        type: 'INCREMENT_REMINDER',
        createdAt: {
          gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
          lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
        }
      }
    });

    return NextResponse.json({
      success: true,
      debug: {
        today: today.toDateString(),
        oneWeekFromToday: oneWeekFromToday.toDateString(),
        totalEmployees: employees.length,
        eligibleEmployees,
        existingNotificationsToday: existingNotifications.length,
        existingNotifications: existingNotifications.map(n => ({
          id: n.id,
          title: n.title,
          metadata: n.metadata
        }))
      }
    });
  } catch (error) {
    console.error('Test error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}