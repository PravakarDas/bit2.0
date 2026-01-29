import { getDbUser } from "@/actions/user.actions";
import { redirect } from "next/navigation";
import EmployeeTimelineClient from "@/components/employee/EmployeeTimelineClient";

export default async function EmployeeTimelinePage() {
  const user = await getDbUser();
  
  if (!user) {
    redirect("/sign-in");
  }

  return <EmployeeTimelineClient userId={user.id} />;
}