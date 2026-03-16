import { getPublicHolidays } from "@/actions/leave.actions";
import { getActiveBranches } from "@/actions/branch.actions";
import { HolidayManagement } from "@/components/admin/HolidayManagement";

export default async function ManagerHolidaysPage() {
    const currentYear = new Date().getFullYear();
    const [holidays, branches] = await Promise.all([
        getPublicHolidays(currentYear),
        getActiveBranches()
    ]);

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
                branches={branches}
            />
        </div>
    );
}