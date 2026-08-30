"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { getUserProfile, updateUserProfile } from "../action"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
}

function ProfileSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <div className="flex items-center gap-3 border-b border-border/70 pb-5">
        <div className="size-12 animate-pulse rounded-full bg-muted/40" />
        <div className="space-y-2">
          <div className="h-3.5 w-36 animate-pulse rounded bg-muted/40" />
          <div className="h-3 w-28 animate-pulse rounded bg-muted/30" />
        </div>
      </div>
      <div className="mt-5 space-y-4">
        <div className="space-y-2">
          <div className="h-3 w-16 animate-pulse rounded bg-muted/30" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/25" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-12 animate-pulse rounded bg-muted/30" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/25" />
        </div>
        <div className="h-9 w-28 animate-pulse rounded-lg bg-muted/30" />
      </div>
    </div>
  )
}

export function ProfileForm() {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => await getUserProfile(),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (profile) {
      setName(profile.name || "")
      setEmail(profile.email || "")
    }
  }, [profile])

  const dirty = useMemo(() => {
    if (!profile) return false
    return (
      name.trim() !== (profile.name || "").trim() ||
      email.trim() !== (profile.email || "").trim()
    )
  }, [profile, name, email])

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; email: string }) => {
      return await updateUserProfile(data)
    },
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["user-profile"] })
        queryClient.invalidateQueries({ queryKey: ["dashboard-user-profile"] })
        toast.success("Profile updated")
      } else {
        toast.error(result?.error || "Failed to update profile")
      }
    },
    onError: () => toast.error("Failed to update profile"),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!dirty || updateMutation.isPending) return
    updateMutation.mutate({ name: name.trim(), email: email.trim() })
  }

  if (isLoading) return <ProfileSkeleton />

  const displayName = profile?.name || "Your profile"
  const avatarUrl = profile?.image || null

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <div className="flex items-center gap-3 border-b border-border/70 pb-5">
        <Avatar className="size-12 border border-border">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
          <AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">
            {initials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {displayName}
          </p>
          <p className="truncate text-xs text-muted-foreground/70">
            {profile?.email || "No email on file"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-xs text-muted-foreground">
            Full name
          </Label>
          <Input
            id="name"
            placeholder="Yash Dewasthale"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={updateMutation.isPending}
            className="h-10 rounded-lg bg-background"
            autoComplete="name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs text-muted-foreground">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={updateMutation.isPending}
            className="h-10 rounded-lg bg-background"
            autoComplete="email"
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button
            type="submit"
            disabled={!dirty || updateMutation.isPending}
            className={cn(
              "h-9 rounded-lg text-xs",
              "transition-transform duration-160 ease-out",
              "active:scale-[0.97]",
            )}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
          {dirty ? (
            <span className="text-[11px] text-muted-foreground/55">
              Unsaved changes
            </span>
          ) : null}
        </div>
      </form>
    </div>
  )
}
