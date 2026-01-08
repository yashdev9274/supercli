import { Button } from "@/components/ui/button";
import Logout from "@/modules/components/logout";
import { requireAuth } from "@/modules/components/utils/auth-utils";
import Image from "next/image";

export default async function Home() {

  await requireAuth()
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <Logout>
        <Button>Logout</Button>
      </Logout>
      
    </div>
  );
}
