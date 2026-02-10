"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Github,
  GitBranch,
  Check,
  ExternalLink,
  Search,
  Filter,
  MoreHorizontal,
  RefreshCw,
  Loader2,
  Plus,
  Settings,
  Trash2,
  Link2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock data for providers
const providers = [
  {
    id: "github",
    name: "GitHub",
    icon: Github,
    description: "Connect your GitHub repositories for code review and analysis",
    connected: false,
    color: "#24292e",
  },
  {
    id: "gitlab",
    name: "GitLab",
    icon: GitBranch,
    description: "Integrate with GitLab for seamless CI/CD and code management",
    connected: false,
    color: "#fc6d26",
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    icon: GitBranch,
    description: "Connect Bitbucket repositories for team collaboration",
    connected: false,
    color: "#0052cc",
  },
  {
    id: "azure",
    name: "Azure DevOps",
    icon: GitBranch,
    description: "Integrate with Azure DevOps for enterprise workflows",
    connected: false,
    color: "#0078d4",
  },
];

// Mock connected repositories
const connectedRepos = [
  {
    id: "1",
    name: "greptile-dashboard",
    provider: "github",
    owner: "lamflo",
    visibility: "private",
    lastSync: "2 mins ago",
    status: "synced",
    branches: 12,
    prs: 5,
  },
  {
    id: "2",
    name: "api-service",
    provider: "github",
    owner: "lamflo",
    visibility: "private",
    lastSync: "15 mins ago",
    status: "synced",
    branches: 8,
    prs: 3,
  },
  {
    id: "3",
    name: "web-client",
    provider: "github",
    owner: "lamflo",
    visibility: "public",
    lastSync: "1 hour ago",
    status: "syncing",
    branches: 6,
    prs: 2,
  },
];

export default function ProvidersPage() {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedProviders, setConnectedProviders] = useState<string[]>(["github"]);

  const handleConnect = async (providerId: string) => {
    setIsConnecting(true);
    setSelectedProvider(providerId);
    
    // Simulate connection process
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    setConnectedProviders((prev) => [...prev, providerId]);
    setIsConnecting(false);
    setSelectedProvider(null);
  };

  const handleDisconnect = (providerId: string) => {
    setConnectedProviders((prev) => prev.filter((p) => p !== providerId));
  };

  const filteredRepos = connectedRepos.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

      {/* Provider Cards */}
      {/* <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-10"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase">
            Available Providers
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {providers.map((provider, index) => {
            const isConnected = connectedProviders.includes(provider.id);
            const isLoading = isConnecting && selectedProvider === provider.id;

            return (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className={cn(
                  "group relative flex flex-col border bg-card p-5 transition-all hover:border-white/10 rounded-xl",
                  isConnected ? "border-primary/30" : "border-border"
                )}
              >
                {isConnected && (
                  <div className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}

                <div className="mb-4 flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
                    style={{ backgroundColor: `${provider.color}20` }}
                  >
                    <provider.icon
                      className="h-5 w-5"
                      style={{ color: provider.color }}
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground">
                      {provider.name}
                    </h3>
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        isConnected ? "text-primary" : "text-muted-foreground/40"
                      )}
                    >
                      {isConnected ? "Connected" : "Not connected"}
                    </span>
                  </div>
                </div>

                <p className="mb-4 flex-1 text-[11px] text-muted-foreground/50 leading-relaxed">
                  {provider.description}
                </p>

                <button
                  onClick={() =>
                    isConnected
                      ? handleDisconnect(provider.id)
                      : handleConnect(provider.id)
                  }
                  disabled={isLoading}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium transition-all",
                    isConnected
                      ? "border border-border bg-muted/30 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Connecting...
                    </>
                  ) : isConnected ? (
                    <>
                      <Settings className="h-3.5 w-3.5" />
                      Manage
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      Connect
                    </>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>
      </motion.div> */}

      {/* Connected Repositories */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex-1"
      >
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase">
            Connected Repositories ({filteredRepos.length})
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

        {/* Repository List */}
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 border-b border-border bg-muted/20 px-5 py-3 text-[10px] font-bold tracking-wider text-muted-foreground/40 uppercase">
            <div className="col-span-4">Repository</div>
            <div className="col-span-2">Provider</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Last Sync</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {/* Table Body */}
          <AnimatePresence mode="popLayout">
            {filteredRepos.map((repo, index) => (
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
                      <span className="text-xs text-amber-500">Syncing</span>
                    </>
                  )}
                </div>

                {/* Last Sync */}
                <div className="col-span-2 flex items-center">
                  <span className="text-xs text-muted-foreground/50">
                    {repo.lastSync}
                  </span>
                </div>

                {/* Actions */}
                <div className="col-span-2 flex items-center justify-end gap-2">
                  <button className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 hover:bg-muted/30 hover:text-foreground transition-all opacity-0 group-hover:opacity-100">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 hover:bg-muted/30 hover:text-foreground transition-all opacity-0 group-hover:opacity-100">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                  <button className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-all opacity-0 group-hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 hover:bg-muted/30 hover:text-foreground transition-all">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Empty State */}
          {filteredRepos.length === 0 && (
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

        {/* Stats Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-6 flex items-center justify-between text-[10px] text-muted-foreground/40"
        >
          <div className="flex items-center gap-6">
            <span>
              <strong className="text-foreground">{connectedRepos.length}</strong>{" "}
              repositories connected
            </span>
            <span>
              <strong className="text-foreground">
                {connectedRepos.reduce((acc, r) => acc + r.branches, 0)}
              </strong>{" "}
              branches tracked
            </span>
            <span>
              <strong className="text-foreground">
                {connectedRepos.reduce((acc, r) => acc + r.prs, 0)}
              </strong>{" "}
              open PRs
            </span>
          </div>
          <span className="text-muted-foreground/30">
            Last updated: just now
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}
