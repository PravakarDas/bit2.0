import { Button } from "@/components/ui/button";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function PendingPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
            <div className="absolute top-4 right-4">
                <UserButton />
            </div>
            <h1 className="text-4xl font-bold mb-4">Account Pending Approval</h1>
            <p className="text-muted-foreground mb-8">
                Your account is currently pending approval by an administrator.
                Please check back later or contact HR.
            </p>
            <Button asChild>
                <Link href="/">Refresh Status</Link>
            </Button>
        </div>
    );
}
