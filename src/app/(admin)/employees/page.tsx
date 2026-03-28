import { redirect } from "next/navigation";

export default async function EmployeesPage() {
    redirect("/admin/employees");
}