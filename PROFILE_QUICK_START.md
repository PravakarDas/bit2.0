# Employee Profile Management - Quick Start Guide

## What's New

Your employee management system now includes comprehensive profile management with the following key features:

✅ **25+ New Employee Data Fields** - Personal info, addresses, emergency contacts, banking, and more  
✅ **Employee Self-Service** - Employees can view and update their own information  
✅ **Approval Workflow** - All employee-submitted changes require admin approval  
✅ **Admin Direct Edit** - Admins can edit employee profiles instantly  
✅ **Complete Audit Trail** - Track all profile changes and approval decisions  

## For Employees

### Viewing Your Profile
1. Navigate to **Profile** from the sidebar
2. Your complete profile information is displayed in organized sections

### Editing Your Profile
1. Go to **Profile** page
2. Click the **Edit Profile** tab
3. Update any fields you need to change
4. Click **Submit for Approval**
5. Your changes will be sent to an admin for review

### Tracking Your Requests
1. Go to **Profile** page
2. Click the **Update History** tab
3. See all your profile update requests and their status:
   - 🕐 **Pending** - Awaiting admin review
   - ✅ **Approved** - Changes have been applied
   - ❌ **Rejected** - Changes were not approved (with admin notes explaining why)

## For Admins

### Reviewing Profile Update Requests
1. Navigate to **Admin** → **Profile Update Requests**
2. You'll see all pending employee profile update requests
3. For each request:
   - **Green text** shows the new values employees want to update
   - **Strikethrough text** shows the current values
4. Click **Approve** to accept changes or **Reject** to decline
5. Add review notes if needed (required for rejections)

### Editing Employee Profiles Directly
1. Go to **Admin** → **Employees**
2. Click on an employee
3. Click on **Profile** or navigate to their profile page
4. Click the **Edit Profile** tab
5. Make changes as needed
6. Click **Update Profile**
7. Changes are applied immediately (no approval needed for admin edits)

### Viewing Employee Details
Navigate to any employee's profile to see:
- Complete personal information
- Contact details
- Current and permanent addresses
- Employment information
- Emergency contacts
- Banking information (account numbers are partially masked)
- Professional links (portfolio, GitHub, LinkedIn)

## New Fields Available

### Personal Information
- Gender
- Date of Birth
- Blood Group
- NID Number

### Contact Information
- Phone Number
- Personal Email
- Work Email

### Address Information (Current & Permanent)
- Street Address
- City
- State/Province
- Country
- Postal Code

### Employment Details
- Designation (e.g., Software Engineer, Manager)
- Department (e.g., Engineering, HR)
- Date of Joining
- Attendance ID

### Emergency Contact
- Emergency Contact Name
- Relationship
- Phone Number
- Email
- Full Address

### Banking Information
- Bank Account Number

### Professional Links
- Portfolio Website
- GitHub Profile
- LinkedIn Profile

## Workflow Diagram

```
┌─────────────────────────────────────────────────────┐
│ EMPLOYEE edits profile                               │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ Profile Update Request created (PENDING)             │
│ Admin receives notification                          │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ ADMIN reviews request                                │
└────────┬────────────────────────┬───────────────────┘
         │                        │
    APPROVE                   REJECT
         │                        │
         ▼                        ▼
┌─────────────────┐    ┌──────────────────────────────┐
│ Changes applied │    │ Request marked as rejected    │
│ to User table   │    │ Employee notified with notes  │
└─────────────────┘    └──────────────────────────────┘
```

## Best Practices

### For Employees
- ✅ Keep your information up to date
- ✅ Provide complete and accurate emergency contact details
- ✅ Update your contact information if you move or change phone numbers
- ✅ Add professional links to showcase your work

### For Admins
- ✅ Review profile update requests promptly
- ✅ Provide clear notes when rejecting requests
- ✅ Verify sensitive information (NID, bank account) before approving
- ✅ Use direct edit for approved employees only
- ✅ Ensure emergency contact information is complete for all employees

## Security Notes

- 🔒 Bank account numbers are partially masked when displayed
- 🔒 Only admins (SUPERADMIN, HR, MANAGER) can approve requests
- 🔒 All changes are tracked with timestamps and reviewer information
- 🔒 Employees can only edit their own profiles
- 🔒 All sensitive data is stored securely in the database

## Need Help?

If you encounter any issues:
1. Check that you're logged in with the correct account
2. Verify your role has the necessary permissions
3. Ensure all required fields are filled in forms
4. Contact your system administrator if problems persist

## Technical Details

For developers and system administrators, see the complete technical documentation in `EMPLOYEE_PROFILE_SYSTEM.md`.
