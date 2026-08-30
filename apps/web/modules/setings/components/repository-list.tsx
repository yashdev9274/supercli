"use client"

import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  AlertTriangle,
  ExternalLink,
  GitBranch,
  Loader2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import {
  disconnectAllRepositories,
  disconnectRepository,
  getConnectedRepositories,
} from "../action"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function RepoSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-4 w-44 animate-pulse rounded bg-muted/40" />
          <div className="h-3 w-56 animate-pulse rounded bg-muted/30" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-14 animate-pulse rounded-lg bg-muted/20" />
        <div className="h-14 animate-pulse rounded-lg bg-muted/20" />
      </div>
    </div>
  )
}

export function RepositoryList() {
  const queryClient = useQueryClient()
  const [disconnectAllOpen, setDisconnectAllOpen] = useState(false)

  const { data: repositories, isLoading } = useQuery({
    queryKey: ["connected-repositories"],
    queryFn: async () => await getConnectedRepositories(),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  })

  const disconnectMutation = useMutation({
    mutationFn: async (repositoryId: string) => {
      return await disconnectRepository(repositoryId)
    },
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["connected-repositories"] })
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        toast.success("Repository disconnected")
      } else {
        toast.error(result?.error || "Failed to disconnect repository")
      }
    },
  })

  const disconnectAllMutation = useMutation({
    mutationFn: async () => {
      return await disconnectAllRepositories()
    },
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["connected-repositories"] })
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        toast.success(`Disconnected ${result.count} repositories`)
        setDisconnectAllOpen(false)
      } else {
        toast.error(result?.error || "Failed to disconnect repositories")
      }
    },
  })

  if (isLoading) return <RepoSkeleton />

  const repos = repositories ?? []
  const count = repos.length

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              Connected repositories
            </p>
            {count > 0 ? (
              <span className="rounded-full border border-border bg-muted/20 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {count}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/70">
            Repos Supercode watches for PR reviews
          </p>
        </div>

        {count > 0 ? (
          <AlertDialog open={disconnectAllOpen} onOpenChange={setDisconnectAllOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 rounded-lg text-xs text-destructive hover:text-destructive",
                  "transition-transform duration-160 ease-out",
                  "active:scale-[0.97]",
                )}
              >
                <Trash2 className="size-3.5" />
                Disconnect all
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Disconnect all repositories?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This removes all {count} repositories and their associated AI
                  reviews. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => disconnectAllMutation.mutate()}
                  className={cn(
                    "rounded-lg bg-destructive text-white hover:bg-destructive/90",
                    "transition-transform duration-160 ease-out active:scale-[0.97]",
                  )}
                  disabled={disconnectAllMutation.isPending}
                >
                  {disconnectAllMutation.isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Disconnecting…
                    </>
                  ) : (
                    "Disconnect all"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>

      {count === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 px-4 py-10 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background">
            <GitBranch className="h-4 w-4 text-muted-foreground/70" />
          </div>
          <p className="text-sm font-medium text-foreground">
            No repositories connected
          </p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground/65">
            Connect repos from Connections to start automatic PR reviews.
          </p>
          <Button
            asChild
            variant="outline"
            size="sm"
            className={cn(
              "mt-4 h-8 rounded-lg text-xs",
              "transition-transform duration-160 ease-out active:scale-[0.97]",
            )}
          >
            <Link href="/dashboard/providers">Connect repositories</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {repos.map((repo) => (
            <li
              key={repo.id}
              className={cn(
                "group flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-background/40 px-3.5 py-3",
                "transition-[background-color,border-color] duration-200 ease-out",
                "supports-[hover:hover]:hover:border-border supports-[hover:hover]:hover:bg-muted/20",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {repo.fullName}
                  </p>
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "shrink-0 text-muted-foreground/50 outline-none",
                      "transition-colors duration-150 ease-out",
                      "supports-[hover:hover]:hover:text-foreground",
                      "focus-visible:text-foreground",
                    )}
                    aria-label={`Open ${repo.fullName} on GitHub`}
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
                {repo.createdAt ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground/50">
                    Connected{" "}
                    {new Date(repo.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                ) : null}
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={cn(
                      "shrink-0 text-muted-foreground/50",
                      "transition-[transform,color,background-color] duration-160 ease-out",
                      "active:scale-[0.97]",
                      "supports-[hover:hover]:hover:bg-destructive/10 supports-[hover:hover]:hover:text-destructive",
                    )}
                    aria-label={`Disconnect ${repo.fullName}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect repository?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This disconnects{" "}
                      <span className="font-medium text-foreground">
                        {repo.fullName}
                      </span>{" "}
                      and deletes associated AI reviews. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnectMutation.mutate(repo.id)}
                      className={cn(
                        "rounded-lg bg-destructive text-white hover:bg-destructive/90",
                        "transition-transform duration-160 ease-out active:scale-[0.97]",
                      )}
                      disabled={disconnectMutation.isPending}
                    >
                      {disconnectMutation.isPending ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Disconnecting…
                        </>
                      ) : (
                        "Disconnect"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
