import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function UnauthorizedPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
            <h1 className="text-4xl font-bold mb-4">Unauthorized</h1>
            <p className="text-muted-foreground mb-8">
                You do not have permission to access this page.
            </p>
            <Button asChild>
                <Link href="/">Go to Homepage</Link>
            </Button>
        </div>
    );
}
