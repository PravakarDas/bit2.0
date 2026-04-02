import { redirect } from "next/navigation";
import { getDbUser } from "@/actions/user.actions";
import { getSystemControlConfig, getSystemControlChangeLog } from "@/actions/system-control.actions";
import SystemControlClient from "@/components/system/SystemControlClient";

export default async function ManagerSystemControlPage() {
  const user = await getDbUser();
  if (!user) {
    redirect("/sign-in");
  }

  if (!(user.role === "EMPLOYEE" && user.isManager)) {
    redirect("/unauthorized");
  }

  const [{ settings, permissions }, logs] = await Promise.all([
    getSystemControlConfig(),
    getSystemControlChangeLog(100),
  ]);

  return (
    <SystemControlClient
      initialSettings={settings}
      canEditSensitive={permissions.canEditSensitive}
      isManager={permissions.isManager}
      logs={logs}
    />
  );
}
