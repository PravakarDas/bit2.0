import { getPublicHolidays } from "@/actions/leave.actions";
import { HolidayManagement } from "@/components/admin/HolidayManagement";

export default async function ManagerHolidaysPage() {
    const currentYear = new Date().getFullYear();
    const holidays = await getPublicHolidays(currentYear);

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-6">
                <h1 className="text-3xl font-bold">Holiday Management</h1>
                <p className="text-muted-foreground">
                    Manage public holidays for leave request validation
                </p>
            </div>
            
            <HolidayManagement 
                holidays={holidays} 
                currentYear={currentYear} 
            />
        </div>
    );
}