"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Github,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Plus,
  Trash2,
  Link2,
  AlertCircle,
  Link,
} from "lucide-react";
import { useRepositories } from "@/modules/repository/hooks/use-repositories";
import { RepositoryListSkeleton } from "@/modules/repository/components/repository-skelaton";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  private: boolean;
  isConnected?: boolean;
}

export default function ProvidersPage() {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useRepositories();

  const [searchQuery, setSearchQuery] = useState("");
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const observerTarget = useRef<HTMLDivElement>(null);

  const handleConnect = async (repoId: string) => {
    setConnectingId(repoId);
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    setConnectedIds(prev => new Set(prev).add(repoId));
    setConnectingId(null);
  };

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      {
        threshold: 0.1,
      }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten paginated data
  const allRepositories: GitHubRepo[] = data?.pages.flatMap(page => page) || [];

  // Filter repositories based on search
  const filteredRepos = allRepositories.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Transform GitHub data to match UI structure
  const transformedRepos = filteredRepos.map(repo => {
    const isConnected = repo.isConnected || connectedIds.has(String(repo.id));
    return {
      id: String(repo.id),
      name: repo.name,
      provider: "github",
      owner: repo.full_name.split('/')[0] || "unknown",
      visibility: repo.private ? "private" as const : "public" as const,
      lastSync: "Just now",
      status: isConnected ? "synced" as const : "syncing" as const,
      branches: 0,
      prs: 0,
      html_url: repo.html_url,
      language: repo.language,
      isConnected,
      isConnecting: connectingId === String(repo.id),
    };
  });

  const stats = {
    totalRepos: transformedRepos.length,
    totalBranches: transformedRepos.reduce((acc, r) => acc + r.branches, 0),
    totalPRs: transformedRepos.reduce((acc, r) => acc + r.prs, 0),
  };

  return (
    <div className="flex flex-1 flex-col bg-background p-4 md:p-8 pt-8 min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10 flex flex-col gap-2"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center border border-border bg-muted/20">
            <Link2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-medium tracking-tight text-foreground">
              Code Providers
            </h1>
            <p className="text-xs text-muted-foreground/60">
              Connect and manage your code repositories
            </p>
          </div>
        </div>
      </motion.div>

      {/* Connected Repositories */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex-1"
      >
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase">
            Connected Repositories ({transformedRepos.length})
          </h2>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
              <input
                type="text"
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-64 rounded-lg border border-border bg-muted/20 pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>

            <button className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 text-xs text-muted-foreground/60 hover:bg-muted/40 hover:text-foreground transition-all">
              <Filter className="h-3.5 w-3.5" />
              Filter
            </button>

            <button className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-all">
              <Plus className="h-3.5 w-3.5" />
              Add Repo
            </button>
          </div>
        </div>

        {/* Loading State - Initial */}
        {isLoading && (
          <div className="py-4">
            <RepositoryListSkeleton />
          </div>
        )}

        {/* Error State */}
        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-muted/10 mb-4">
              <AlertCircle className="h-8 w-8 text-destructive/60" />
            </div>
            <span className="text-sm font-medium text-foreground mb-1">
              Failed to load repositories
            </span>
            <span className="text-xs text-muted-foreground/40">
              Please try again later
            </span>
          </div>
        )}

        {/* Repository List */}
        {!isLoading && !isError && (
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 border-b border-border bg-muted/20 px-5 py-3 text-[10px] font-bold tracking-wider text-muted-foreground/40 uppercase">
              <div className="col-span-4">Repository</div>
              <div className="col-span-2">Provider</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Language</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {/* Table Body */}
            <AnimatePresence mode="popLayout">
              {transformedRepos.map((repo, index) => (
                <motion.div
                  key={repo.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="group grid grid-cols-12 gap-4 border-b border-border px-5 py-4 hover:bg-muted/10 transition-colors last:border-b-0"
                >
                  {/* Repository Name */}
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/30">
                      <Github className="h-4 w-4 text-muted-foreground/60" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {repo.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40">
                        {repo.owner}/{repo.name}
                      </span>
                    </div>
                    {repo.visibility === "private" && (
                      <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[9px] font-medium text-muted-foreground/50">
                        Private
                      </span>
                    )}
                  </div>

                  {/* Provider */}
                  <div className="col-span-2 flex items-center">
                    <span className="text-xs text-muted-foreground/60 capitalize">
                      {repo.provider}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="col-span-2 flex items-center gap-2">
                    {repo.status === "synced" ? (
                      <>
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-xs text-primary">Synced</span>
                      </>
                    ) : (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                        <span className="text-xs text-amber-500">Not connected</span>
                      </>
                    )}
                  </div>

                  {/* Language */}
                  <div className="col-span-2 flex items-center">
                    <span className="text-xs text-muted-foreground/50">
                      {repo.language || "Unknown"}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <button className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 hover:bg-muted/30 hover:text-foreground transition-all opacity-0 group-hover:opacity-100">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <a 
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 hover:bg-muted/30 hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-all opacity-0 group-hover:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleConnect(repo.id)}
                      disabled={repo.isConnecting || repo.isConnected}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        repo.isConnected
                          ? "bg-primary/10 text-primary border border-primary/20 cursor-default"
                          : repo.isConnecting
                          ? "bg-muted text-muted-foreground cursor-wait"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      }`}
                    >
                      {repo.isConnecting ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Connecting...
                        </>
                      ) : repo.isConnected ? (
                        <>
                          <Link className="h-3 w-3" />
                          Connected
                        </>
                      ) : (
                        <>
                          <Link className="h-3 w-3" />
                          Connect
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Empty State */}
            {transformedRepos.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-muted/10 mb-4">
                  <AlertCircle className="h-8 w-8 text-muted-foreground/20" />
                </div>
                <span className="text-sm font-medium text-foreground mb-1">
                  No repositories found
                </span>
                <span className="text-xs text-muted-foreground/40">
                  {searchQuery
                    ? "Try adjusting your search query"
                    : "Connect a provider to add repositories"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Infinite Scroll Observer Target */}
        <div ref={observerTarget} className="py-4">
          {isFetchingNextPage && <RepositoryListSkeleton />}
          {!hasNextPage && allRepositories.length > 0 && (
            <p className="text-center text-muted-foreground text-xs">
              No more repositories
            </p>
          )}
        </div>

        {/* Stats Footer */}
        {!isLoading && !isError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-6 flex items-center justify-between text-[10px] text-muted-foreground/40"
          >
            <div className="flex items-center gap-6">
              <span>
                <strong className="text-foreground">{stats.totalRepos}</strong>{" "}
                repositories connected
              </span>
              <span>
                <strong className="text-foreground">
                  {stats.totalBranches}
                </strong>{" "}
                branches tracked
              </span>
              <span>
                <strong className="text-foreground">
                  {stats.totalPRs}
                </strong>{" "}
                open PRs
              </span>
            </div>
            <span className="text-muted-foreground/30">
              Last updated: just now
            </span>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
