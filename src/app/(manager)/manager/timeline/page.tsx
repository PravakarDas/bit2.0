import TimelineClient from "@/components/admin/TimelineClient";
import { getRuntimeSystemControlConfig } from "@/lib/system-control";

export const dynamic = "force-dynamic";

export default async function ManagerTimelinePage() {
  const { zktecoCronEnabled } = await getRuntimeSystemControlConfig();
  return <TimelineClient zktecoSyncEnabled={zktecoCronEnabled} />;
}
