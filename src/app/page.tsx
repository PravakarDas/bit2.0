import { syncUserWithDb } from "@/actions/user.actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await syncUserWithDb();

  if (!user) {
    redirect("/sign-in");
  }

  if (user.status === "PENDING") {
    redirect("/pending");
  }

  if (user.role === "SUPERADMIN") {
    redirect("/admin");
  }

  redirect("/dashboard");
}
