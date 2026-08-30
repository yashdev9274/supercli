"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Building2,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"
import {
  createOrganization,
  getDashboardOrganizations,
  selectOrganization,
  type DashboardOrganization,
} from "@/modules/dashboard/actions/user-org"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
}

function OrgAvatar({
  org,
  className,
}: {
  org: Pick<DashboardOrganization, "name" | "avatarUrl" | "kind">
  className?: string
}) {
  return (
    <Avatar className={cn("size-5 rounded-md", className)}>
      {org.avatarUrl ? (
        <AvatarImage src={org.avatarUrl} alt={org.name} className="rounded-md" />
      ) : null}
      <AvatarFallback
        className={cn(
          "rounded-md text-[9px] font-semibold",
          org.kind === "personal"
            ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
            : "bg-muted text-muted-foreground",
        )}
      >
        {org.kind === "personal" ? (
          <UserRound className="size-3" />
        ) : org.kind === "github" ? (
          <Building2 className="size-3" />
        ) : (
          initials(org.name)
        )}
      </AvatarFallback>
    </Avatar>
  )
}

export function OrgSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [newOrgName, setNewOrgName] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dashboard-organizations"],
    queryFn: async () => await getDashboardOrganizations(),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  })

  const organizations = data?.organizations ?? []
  const current = useMemo(
    () => organizations.find((o) => o.isCurrent) ?? organizations[0] ?? null,
    [organizations],
  )

  const selectMutation = useMutation({
    mutationFn: async (organizationId: string) => selectOrganization(organizationId),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["dashboard-organizations"] })
        toast.success("Organization switched")
        setMenuOpen(false)
      } else {
        toast.error(result.error || "Failed to switch organization")
      }
    },
    onError: () => toast.error("Failed to switch organization"),
  })

  const createMutation = useMutation({
    mutationFn: async (name: string) => createOrganization(name),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["dashboard-organizations"] })
        toast.success(`Created ${result.organization.name}`)
        setCreateOpen(false)
        setNewOrgName("")
        setMenuOpen(false)
      } else {
        toast.error(result.error || "Failed to create organization")
      }
    },
    onError: () => toast.error("Failed to create organization"),
  })

  if (collapsed) {
    return (
      <div className="mx-auto flex items-center justify-center">
        {current ? (
          <OrgAvatar org={current} className="size-7 rounded-md" />
        ) : (
          <div className="size-7 rounded-md border border-border bg-muted/30" />
        )}
      </div>
    )
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex max-w-full items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-sidebar-accent/50"
          >
            {isLoading && !current ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : current ? (
              <OrgAvatar org={current} />
            ) : (
              <div className="size-5 rounded-md border border-border bg-muted/30" />
            )}
            <span className="max-w-[140px] truncate font-medium tracking-tight text-foreground">
              {current?.name || "Select organization"}
            </span>
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          sideOffset={8}
          // Sidebar uses z-[70]; keep the org card above it.
          className="z-[80] w-64 rounded-xl border border-border bg-popover p-1.5 shadow-xl"
        >
          <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Accounts
          </DropdownMenuLabel>

          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading…
            </div>
          ) : organizations.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No organizations yet
            </div>
          ) : (
            organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs"
                disabled={selectMutation.isPending}
                onSelect={(e) => {
                  e.preventDefault()
                  if (org.isCurrent) return
                  selectMutation.mutate(org.id)
                }}
              >
                <OrgAvatar org={org} />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {org.name}
                </span>
                {org.kind === "github" ? (
                  <span className="text-[9px] text-muted-foreground/70">GH</span>
                ) : null}
                {org.isCurrent ? (
                  <Check className="size-3.5 shrink-0 text-primary" />
                ) : null}
              </DropdownMenuItem>
            ))
          )}

          <DropdownMenuSeparator className="my-1.5" />

          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground"
            disabled={isFetching}
            onSelect={(e) => {
              e.preventDefault()
              void refetch()
            }}
          >
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
            <span>Refresh list</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground"
            onSelect={() => {
              window.open("https://github.com/settings/organizations", "_blank", "noopener,noreferrer")
            }}
          >
            <ExternalLink className="size-3.5" />
            <span>View all organizations</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1.5" />

          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-foreground"
            onSelect={(e) => {
              e.preventDefault()
              setMenuOpen(false)
              setCreateOpen(true)
            }}
          >
            <Plus className="size-3.5" />
            <span>Add organization</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

<Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          // Sidebar is z-[70]; keep create-org card + overlay above it.
          className="z-[80] sm:max-w-[480px] rounded-2xl border border-border bg-card p-0 gap-0 overflow-hidden"
          overlayClassName="z-[80]"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!newOrgName.trim() || createMutation.isPending) return
              createMutation.mutate(newOrgName)
            }}
          >
            <DialogHeader className="space-y-2 px-6 pt-6 pb-2">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                Create Organization
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                Organizations are a way to group your projects and users. You can
                create multiple organizations to keep your projects separate.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 px-6 py-4">
              <Label htmlFor="org-name" className="text-sm font-medium">
                Organization Name
              </Label>
              <Input
                id="org-name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Acme Corp"
                className="h-11 rounded-xl border-border bg-background"
                autoFocus
                maxLength={80}
              />
            </div>

            <DialogFooter className="flex items-center justify-end gap-2 border-t border-border bg-muted/10 px-6 py-4 sm:space-x-0">
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || !newOrgName.trim()}
                className="min-w-[96px] rounded-xl"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
