import { Button } from "@/components/ui/button";
import { getDbUser } from "@/actions/user.actions";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function UnauthorizedPage() {
    const user = await getDbUser();
    
    // Redirect employees to their dashboard instead of showing unauthorized
    if (user && user.role === "EMPLOYEE") {
        redirect("/dashboard");
    }
    
    return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
            <h1 className="text-4xl font-bold mb-4">Unauthorized</h1>
            <p className="text-muted-foreground mb-8">
                You do not have permission to access this page.
            </p>
            <div className="space-x-4">
                <Button asChild>
                    <Link href="/dashboard">Go to Dashboard</Link>
                </Button>
                <Button variant="outline" asChild>
                    <Link href="/profile">View Profile</Link>
                </Button>
            </div>
        </div>
    );
}
