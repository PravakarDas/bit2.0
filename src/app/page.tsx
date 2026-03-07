import { syncUserWithDb } from "@/actions/user.actions";
import { redirect } from "next/navigation";

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

  if (user.role === "MANAGER") {
    redirect("/manager");
  }

  redirect("/dashboard");
}
