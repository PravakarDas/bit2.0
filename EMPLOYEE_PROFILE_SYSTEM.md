# Employee Profile Management System

## Overview

This document describes the comprehensive employee profile management system that has been added to the application. The system allows employees to maintain detailed personal and professional information while ensuring all changes are subject to admin approval.

## Features

### 1. Extended Employee Information

The User table has been extended with the following categories of information:

#### Personal Information
- Gender
- Date of Birth
- Blood Group
- NID Number

#### Contact Information
- Phone Number
- Personal Email
- Work Email

#### Address Information
**Current Address:**
- Street
- City
- State
- Country
- Postal Code

**Permanent Address:**
- Street
- City
- State
- Country
- Postal Code

#### Employment Details
- Designation
- Department
- Date of Joining
- Attendance ID

#### Emergency Contact
- Name
- Relationship
- Phone
- Email
- Address

#### Banking Information
- Bank Account Number (stored securely)

#### Professional Links
- Portfolio Link
- GitHub Link
- LinkedIn Link

### 2. Role-Based Access Control

#### Employee Capabilities
- **View Profile**: Employees can view all their personal and employment information at any time
- **Edit Profile**: Employees can submit profile update requests
- **Track Requests**: Employees can view the status of their profile update requests (Pending, Approved, Rejected)
- **Review History**: Complete history of all profile update submissions

#### Admin Capabilities
- **View All Profiles**: Admins can view detailed profiles of all employees
- **Direct Edit**: Admins can edit employee profiles directly without approval workflow
- **Review Requests**: View all pending profile update requests from employees
- **Approve/Reject**: Approve or reject employee-submitted profile changes with review notes
- **Audit Trail**: Complete history of all profile changes and approval decisions

### 3. Approval Workflow

When an employee submits a profile update:

1. **Submission**: Employee fills out the profile edit form with updated information
2. **Request Creation**: A `ProfileUpdateRequest` is created with status `PENDING`
3. **Admin Notification**: Admins receive a notification about the new request
4. **Review**: Admin reviews the requested changes, comparing them with current values
5. **Decision**: Admin either approves or rejects with optional notes
6. **Update**: If approved, changes are applied to the User table
7. **Notification**: Employee can see the status and admin notes in their request history

## Database Schema

### User Table Extensions

```prisma
model User {
  // ... existing fields ...
  
  // Personal Information
  gender               String?
  dateOfBirth          DateTime?
  bloodGroup           String?
  nidNumber            String?
  
  // Contact Information
  phoneNumber          String?
  personalEmail        String?
  workEmail            String?
  
  // Address fields (current and permanent)
  currentStreet        String?
  currentCity          String?
  // ... etc
  
  // Employment Details
  designation          String?
  department           String?
  dateOfJoining        DateTime?
  attendanceId         String?
  
  // Emergency Contact
  emergencyContactName          String?
  emergencyContactRelationship  String?
  // ... etc
  
  // Banking and Professional Links
  bankAccountNumber    String?
  portfolioLink        String?
  githubLink           String?
  linkedinLink         String?
  
  profileUpdateRequests ProfileUpdateRequest[]
}
```

### ProfileUpdateRequest Table

```prisma
model ProfileUpdateRequest {
  id          String              @id @default(cuid())
  userId      String
  user        User                @relation(fields: [userId], references: [id])
  
  status      ProfileUpdateStatus @default(PENDING)
  
  // Stores requested changes as JSON
  requestedChanges Json
  
  // Stores previous values for audit trail
  previousValues   Json?
  
  // Admin review information
  reviewedBy       String?
  reviewedAt       DateTime?
  reviewNotes      String?
  
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
}

enum ProfileUpdateStatus {
  PENDING
  APPROVED
  REJECTED
}
```

## API Endpoints (Server Actions)

### Employee Actions

#### `getCurrentUserProfile()`
Get the current logged-in user's profile information.

**Returns**: User object with branch information

#### `submitProfileUpdateRequest(data: ProfileData)`
Submit a profile update request for admin approval.

**Parameters**: ProfileData object with updated fields
**Returns**: Created ProfileUpdateRequest

#### `getMyProfileUpdateRequests()`
Get all profile update requests for the current user.

**Returns**: Array of ProfileUpdateRequest objects

### Admin Actions

#### `getUserProfileById(userId: string)`
Get profile information for a specific employee (admin only).

**Parameters**: userId
**Returns**: User object with branch information

#### `updateUserProfileByAdmin(userId: string, data: ProfileData)`
Directly update an employee's profile (admin only, bypasses approval).

**Parameters**: userId, ProfileData
**Returns**: Updated User object

#### `getPendingProfileUpdateRequests()`
Get all pending profile update requests (admin only).

**Returns**: Array of ProfileUpdateRequest objects with user info

#### `approveProfileUpdateRequest(requestId: string, reviewNotes?: string)`
Approve a profile update request and apply changes.

**Parameters**: requestId, optional reviewNotes
**Returns**: Success/error status

#### `rejectProfileUpdateRequest(requestId: string, reviewNotes: string)`
Reject a profile update request with a reason.

**Parameters**: requestId, reviewNotes (required)
**Returns**: Success/error status

## UI Components

### For Employees

#### `ProfileView`
- Displays all employee information in organized cards
- Shows sections for personal info, contact, address, employment, emergency contact, banking, and professional links
- Includes edit button if user has permission

#### `ProfileEditForm`
- Comprehensive form with all profile fields
- Organized into collapsible sections
- Client-side validation
- Submits update request (employee) or direct update (admin)

### For Admins

#### `ProfileUpdateRequestsList`
- Displays all pending profile update requests
- Shows employee details and requested changes
- Highlights differences between current and requested values
- Approve/Reject actions with notes

## Routes

### Employee Routes

#### `/profile`
- View personal profile
- Edit profile (submits for approval)
- View update request history

### Admin Routes

#### `/admin/profile-requests`
- Review and approve/reject pending profile update requests

#### `/admin/employees/[id]/profile`
- View employee profile details
- Edit employee profile directly (no approval needed)

## Usage Examples

### Employee: Updating Profile

1. Navigate to `/profile`
2. Click on "Edit Profile" tab
3. Fill out the form with updated information
4. Click "Submit for Approval"
5. Request is created and admin is notified
6. Check "Update History" tab to see request status

### Admin: Reviewing Profile Updates

1. Navigate to `/admin/profile-requests`
2. View list of pending requests
3. Review requested changes (highlighted in green)
4. Click "Approve" or "Reject"
5. Add optional review notes
6. Confirm action
7. Changes are applied (if approved) or request is marked rejected

### Admin: Editing Employee Profile Directly

1. Navigate to `/admin/employees/[id]/profile`
2. Click "Edit Profile" tab
3. Make changes to employee information
4. Click "Update Profile"
5. Changes are applied immediately without approval

## Security Considerations

1. **Role-Based Access**: All admin actions are protected by role checks
2. **Data Validation**: Both client-side and server-side validation
3. **Audit Trail**: All profile changes are tracked with timestamps
4. **Sensitive Data**: Bank account numbers are partially masked in display
5. **Authorization**: Users can only edit their own profiles (subject to approval)

## Migration

A database migration has been created and applied:
```
migrations/20260130085302_add_employee_profile_fields
```

This migration:
- Adds all new columns to the User table
- Creates the ProfileUpdateRequest table
- Adds the ProfileUpdateStatus enum
- Updates the NotificationType enum to include PROFILE_UPDATE_REQUEST

## Future Enhancements

Potential improvements for future versions:

1. **Document Uploads**: Allow employees to upload supporting documents (ID scans, certificates)
2. **Bulk Approval**: Allow admins to approve multiple requests at once
3. **Field-Level Permissions**: Configure which fields require approval vs. instant update
4. **Email Notifications**: Send email notifications for request status changes
5. **Profile Completeness**: Show profile completion percentage to encourage data entry
6. **Change History**: Detailed timeline of all changes made to a profile
7. **Custom Fields**: Allow organizations to add custom profile fields

## Testing Checklist

- [ ] Employee can view their profile
- [ ] Employee can submit profile update request
- [ ] Employee can view request history
- [ ] Admin receives notification of new requests
- [ ] Admin can view all pending requests
- [ ] Admin can approve requests (changes applied)
- [ ] Admin can reject requests (with notes)
- [ ] Admin can edit employee profiles directly
- [ ] All required fields are validated
- [ ] Date fields work correctly
- [ ] URL fields are validated
- [ ] Email fields are validated
- [ ] Sensitive data (bank account) is masked
- [ ] Role permissions are enforced
- [ ] Audit trail is maintained

## Troubleshooting

### Common Issues

**Issue**: Profile update request doesn't appear for admin
- **Solution**: Check if admin notification was created, ensure admin has proper role (SUPERADMIN, HR, or MANAGER)

**Issue**: Changes not applied after approval
- **Solution**: Check server logs for transaction errors, ensure database connection is stable

**Issue**: Form validation errors
- **Solution**: Ensure all required fields marked with asterisk are filled, check date format, verify URL formats for links

**Issue**: Cannot edit profile
- **Solution**: Verify user is logged in, check if user status is APPROVED, ensure no pending requests exist

## Support

For issues or questions regarding the employee profile management system, please contact the development team or submit an issue in the project repository.
