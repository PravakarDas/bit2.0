import Link from "next/link";
import { cn } from "@/lib/utils";

interface EmployeeProfileLinkProps {
    employeeId: string;
    name?: string | null;
    email?: string | null;
    className?: string;
}

export default function EmployeeProfileLink({ employeeId, name, email, className }: EmployeeProfileLinkProps) {
    const displayName = name?.trim() || email?.trim() || "Unknown Employee";

    return (
        <Link
            href={`/admin/employees/${employeeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("hover:underline", className)}
        >
            {displayName}
        </Link>
    );
}