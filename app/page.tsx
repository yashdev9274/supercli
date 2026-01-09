import { Button } from "@/components/ui/button";
import Logout from "@/modules/components/logout";
import { requireAuth } from "@/modules/components/utils/auth-utils";
import Image from "next/image";
import { redirect } from "next/navigation";

export default async function Home() {

  await requireAuth()
  return redirect("/dashboard")
}
