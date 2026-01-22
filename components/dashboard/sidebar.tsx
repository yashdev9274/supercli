"use client";

import { 
  ChevronDown, 
  Home,
  MessageSquare, 
  Zap, 
  CreditCard, 
  Gift, 
  Code2, 
  FileText, 
  Monitor,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
// import { useOrganizations } from "@/hooks/use-organizations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LucideIcon } from "lucide-react";

const PixelLogo = () => {
  return (
    <svg width="36" height="30" viewBox="0 0 9 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* s */}
      <rect x="0" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="3" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="6" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="0" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="0" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="3" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="6" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="6" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="0" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="3" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="6" y="12" width="3" height="3" fill="#52525b"/>
      
    </svg>
  );
};

type NavigationChild = {
  name: string;
  href: string;
};

type NavigationItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  children?: NavigationChild[];
};

type NavigationGroup = {
  section: string | null;
  items: NavigationItem[];
};

const navigation: NavigationGroup[] = [
  { 
    section: null,
    items: [
      { name: "Home", href: "/", icon: Home },
    ]
  },
  { 
    section: "FEATURES",
    items: [
      { 
        name: "Code Review Agent", 
        href: "/code-review", 
        icon: Monitor,
        children: [
          { name: "Settings", href: "/settings" },
          { name: "Logs", href: "/logs" },
          { name: "Analytics", href: "/analytics" },
          { name: "Custom Context", href: "/context" },
        ]
      },
      { name: "Chat", href: "/chat", icon: MessageSquare },
      { 
        name: "Connections", 
        href: "/connections", 
        icon: Zap,
        children: [
          { name: "Integrations", href: "/integrations" },
          { name: "Code Providers", href: "/providers" },
        ]
      },
    ]
  },
  { 
    section: "BILLING & USAGE",
    items: [
      { name: "Billing", href: "/billing", icon: CreditCard },
      { name: "Refer a Friend", href: "/refer", icon: Gift },
    ]
  },
  { 
    section: "API",
    items: [
      { name: "API Keys", href: "/api-keys", icon: Code2 },
      { name: "Documentation", href: "/docs", icon: FileText },
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();
  const [openMenus, setOpenMenus] = useState<string[]>(["Code Review Agent", "Connections"]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
//   const { organizations, currentOrg, createOrg, selectOrg, loading } = useOrganizations();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  

  const toggleMenu = (name: string) => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setOpenMenus([name]);
      return;
    }
    setOpenMenus(prev => 
      prev.includes(name) ? prev.filter(i => i !== name) : [...prev, name]
    );
  };

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile Toggle Button */}
      {!isMobileOpen && (
        <button 
          onClick={() => setIsMobileOpen(true)}
          className="fixed bottom-6 left-6 z-50 flex h-12 w-12 items-center justify-center rounded-none bg-primary text-primary-foreground lg:hidden shadow-2xl border border-primary/20 hover:scale-105 active:scale-95 transition-all"
        >
          <Menu className="h-6 w-6" />
        </button>
      )}

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Content */}
      <motion.aside
        initial={false}
        animate={{ 
          width: isCollapsed ? 64 : 240,
          x: isMobileOpen ? 0 : (typeof window !== 'undefined' && window.innerWidth < 1024 ? -240 : 0)
        }}
        className={cn(
          "fixed inset-y-0 left-0 z-[70] flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all lg:static h-full",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
          <div className="flex h-14 items-center justify-between px-4 border-b border-sidebar-border">
            {!isCollapsed && (
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 rounded-none px-2 py-1 text-sm hover:bg-sidebar-accent/50 transition-colors">
                      <span className="font-bold tracking-tight text-foreground">
                        Select Organization
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 rounded-none">
                    <DropdownMenuLabel className="text-[10px] font-bold tracking-wider text-muted-foreground/50 uppercase">Organizations</DropdownMenuLabel>
                      <DropdownMenuItem 
                        className="flex items-center justify-between gap-2 text-xs cursor-pointer rounded-none"
                      >
                        <span className="font-bold text-primary">
                          SuperCode
                        </span>
                        <Check className="h-3 w-3 text-primary" />
                      </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DialogTrigger asChild>
                      <DropdownMenuItem className="flex items-center gap-2 text-xs cursor-pointer rounded-none text-muted-foreground hover:text-foreground">
                        <Plus className="h-3 w-3" />
                        <span>Create Organization</span>
                      </DropdownMenuItem>
                    </DialogTrigger>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DialogContent className="sm:max-w-[425px] rounded-none">
                  <form>
                    <DialogHeader>
                      <DialogTitle>Create Organization</DialogTitle>
                      <DialogDescription>
                        Enter a name for your new organization.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Organization Name</Label>
                        <Input
                          id="name"
                          value={newOrgName}
                          onChange={(e) => setNewOrgName(e.target.value)}
                          placeholder="Acme Corp"
                          className="rounded-none"
                          autoFocus
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        onClick={() => setIsCreateDialogOpen(false)}
                        className="rounded-none"
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={isCreating || !newOrgName.trim()}
                        className="rounded-none"
                      >
                        {isCreating ? "Creating..." : "Create"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            {isCollapsed && (
               <div className="mx-auto flex items-center justify-center w-full">
                 <PixelLogo />
               </div>
            )}

          <button 
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden text-muted-foreground/40 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-6 scrollbar-none">
          <nav className="space-y-6">
            {navigation.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-1">
                {group.section && !isCollapsed && (
                  <h3 className="px-3 py-2 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/30 uppercase">
                    {group.section}
                  </h3>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href || (item.name === "Home" && pathname === "/");
                    const hasChildren = item.children && item.children.length > 0;
                    const isOpen = openMenus.includes(item.name) && !isCollapsed;

                    return (
                      <div key={item.name} className="space-y-1">
                        {hasChildren ? (
                          <button
                            onClick={() => toggleMenu(item.name)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-none px-3 py-2 text-xs font-medium transition-colors",
                              isActive 
                                ? "bg-primary text-primary-foreground" 
                                : "text-muted-foreground/60 hover:text-foreground hover:bg-orange-500",
                              isCollapsed && "justify-center px-0"
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!isCollapsed && (
                              <>
                                <span className="flex-1 text-left">{item.name}</span>
                                <ChevronDown className={cn("h-3 w-3 transition-transform opacity-50", isOpen && "rotate-180")} />
                              </>
                            )}
                          </button>
                        ) : (
                          <Link
                            href={item.href}
                            className={cn(
                              "flex items-center gap-3 rounded-none px-3 py-2 text-xs font-medium transition-colors",
                              isActive 
                                ? "bg-primary text-primary-foreground" 
                                : "text-muted-foreground/60 hover:text-foreground hover:bg-orange-500",
                              isCollapsed && "justify-center px-0"
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!isCollapsed && item.name}
                          </Link>
                        )}
                        
                        {hasChildren && isOpen && !isCollapsed && (
                          <div className="ml-9 space-y-1 border-l border-sidebar-border pl-2">
                            {item.children?.map((child: { name: string; href: string }) => (
                              <Link
                                key={child.name}
                                href={child.href}
                                className={cn(
                                  "block rounded-none px-3 py-2 text-xs transition-colors",
                                  pathname === child.href 
                                    ? "text-foreground font-medium" 
                                    : "text-muted-foreground/40 hover:text-foreground hover:bg-orange-500"
                                )}
                              >
                                {child.name}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-auto border-t border-sidebar-border p-4">
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex w-full items-center gap-3 rounded-none px-2 py-2 text-xs font-medium text-muted-foreground/40 hover:text-foreground hover:bg-orange-500 transition-colors group"
          >
            <div className="flex h-4 w-4 items-center justify-center">
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              ) : (
                <ChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
              )}
            </div>
            {!isCollapsed && <span>Collapse Sidebar</span>}
          </button>
        </div>
      </motion.aside>
    </>
  );
}
