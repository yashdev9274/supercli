"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Mail, User, CheckCircle2 } from "lucide-react";

function BackgroundGlow() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,146,60,0.06)_0%,transparent_60%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,black_30%,transparent_100%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)] pointer-events-none" />
    </>
  );
}

export default function Home() {
  const { data, isPending } = authClient.useSession()
  const router = useRouter()

  useEffect(() => {
    if (!isPending && !data?.session) {
      router.push("/sign-in")
    }
  }, [data, isPending, router])

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950">
        <Spinner className="size-8 text-amber-500" />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-zinc-950 overflow-hidden flex items-center justify-center">
      <BackgroundGlow />

      <div className="relative z-10 w-full max-w-md px-4 py-8">
        <div className="space-y-6">
          <div className="flex justify-center mb-2">
            <span className="font-mono text-[10px] tracking-[0.25em] text-amber-500/40 uppercase">
              Authenticated Dashboard
            </span>
          </div>

          <Card className="border-2 border-dashed border-zinc-800 bg-zinc-900/40 backdrop-blur-xl shadow-2xl shadow-orange-500/5">
            <CardContent className="px-6 py-8">
              <div className="flex flex-col items-center gap-5">
                <div className="relative">
                  <Avatar size="lg" className="size-24 border-2 border-dashed border-zinc-700">
                    <AvatarImage
                      src={data?.user?.image || undefined}
                      alt={data?.user?.name || "User"}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-zinc-800/80 text-zinc-400 text-2xl">
                      <User className="size-8" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 size-6 bg-emerald-500/90 rounded-full border-[3px] border-zinc-950 flex items-center justify-center">
                    <CheckCircle2 className="size-3 text-white" />
                  </div>
                </div>
                <div className="space-y-1 text-center">
                  <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
                    Welcome, {data?.user?.name || "User"}
                  </h1>
                  <p className="text-sm text-zinc-500 font-mono">
                    Authenticated User
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-dashed border-zinc-800 bg-zinc-900/40 backdrop-blur-xl shadow-2xl shadow-orange-500/5">
            <CardContent className="px-6 py-6">
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Email Address
                  </span>
                  <Mail className="size-3.5 text-zinc-600" />
                </div>
                <p className="text-base text-zinc-200 font-medium break-all -mt-1">
                  {data?.user?.email || "No email"}
                </p>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px border-t border-dashed border-zinc-800" />
                  <span className="text-[11px] text-zinc-600 font-mono px-2">
                    Session Active
                  </span>
                  <div className="flex-1 h-px border-t border-dashed border-zinc-800" />
                </div>

                <Button
                  onClick={() =>
                    authClient.signOut({
                      fetchOptions: {
                        onSuccess: () => router.push("/sign-in"),
                      },
                    })
                  }
                  variant="destructive"
                  className="w-full h-11 bg-red-600/90 hover:bg-red-600 text-white font-medium rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-red-500/15 active:scale-[0.98]"
                >
                  <LogOut className="size-4" />
                  Sign Out
                </Button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px border-t border-dashed border-zinc-800" />
                  <span className="text-[11px] text-zinc-600 font-mono px-2">
                    Session Active
                  </span>
                  <div className="flex-1 h-px border-t border-dashed border-zinc-800" />
                </div>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-[10px] text-zinc-700 font-mono tracking-wider">
            supercode terminal v2.0
          </p>
        </div>
      </div>
    </div>
  );
}
