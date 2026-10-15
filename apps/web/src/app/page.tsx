import { redirect } from "next/navigation";
import { hasAdminUser } from "@ellie/database";
import { getAppUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await hasAdminUser())) redirect("/setup");
  redirect((await getAppUser()) ? "/dashboard" : "/login");
}
