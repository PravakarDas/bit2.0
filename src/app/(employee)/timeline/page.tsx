import { getDbUser } from "@/actions/user.actions";
import { redirect } from "next/navigation";
import EmployeeTimelineClient from "@/components/employee/EmployeeTimelineClient";

export const dynamic = "force-dynamic";

export default async function EmployeeTimelinePage() {
  const user = await getDbUser();
  
  if (!user) {
    redirect("/sign-in");
  }

  return <EmployeeTimelineClient userId={user.id} baseSalary={user.baseSalary} />;
}