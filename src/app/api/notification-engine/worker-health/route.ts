import { NextResponse } from "next/server";
import { getDbUser } from "@/actions/user.actions";
import { getProductionNotificationWorkerSnapshot } from "@/lib/services/notification-engine/production-worker";

/**
 * Phase 11, item 8 (Health Monitoring) — read-only operational visibility
 * into the production worker started from `instrumentation.ts`. Not part of
 * the out-of-scope "Notification Center" (that term refers to an end-user
 * notification inbox/management UI, explicitly forbidden in this and prior
 * phases) — this is ops tooling, the same category as
 * `/api/admin/generate-timeline` and `/api/cron/*`.
 */
export async function GET() {
  const user = await getDbUser();
  if (!user || user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = getProductionNotificationWorkerSnapshot();
  if (!snapshot) {
    return NextResponse.json({ started: false }, { status: 200 });
  }

  return NextResponse.json({ started: true, ...snapshot }, { status: 200 });
}
