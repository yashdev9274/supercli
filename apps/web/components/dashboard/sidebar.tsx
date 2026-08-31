"use client";

import { 
  ChevronDown, 
  Home,
  MessageSquare, 
  Zap, 
  CreditCard, 
  Gift, 
  FileText, 
  Monitor,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useMounted } from "@/hooks/use-mounted";
import { motion, AnimatePresence } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { LockKeyhole } from "@/components/animate-ui/icons/lock-keyhole";

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
  locked?: boolean;
};

type NavigationItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  locked?: boolean;
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
      { name: "Home", href: "/dashboard", icon: Home },
    ]
  },
  { 
    section: "FEATURES",
    items: [
      { 
        name: "Code Review Agent", 
        href: "/dashboard", 
        icon: Monitor,
        children: [
          { name: "PR Review", href: "/dashboard/pull-requests" },
          { name: "Logs", href: "/dashboard/logs", locked: true },
          { name: "Bugs Caught", href: "/dashboard/bugs-caught" },
          { name: "Custom Context", href: "/dashboard/context", locked: true },
        ]
      },
      { name: "Chat", href: "/dashboard/chat", icon: MessageSquare, locked: true },
      { 
        name: "Connections", 
        href: "/dashboard/providers", 
        icon: Zap,
        children: [
          { name: "Connect your repos", href: "/dashboard/providers" },
          { name: "Integrations", href: "/dashboard/integrations" },
        ]
      },
    ]
  },
  { 
    section: "BILLING & USAGE",
    items: [
      { name: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { name: "Refer a Friend", href: "/dashboard/refer", icon: Gift },
    ]
  },
  { 
    section: "Platform",
    items: [
      { name: "Settings", href: "/dashboard/settings", icon: Settings },
      { name: "Documentation", href: "/docs", icon: FileText },
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();
  const [openMenus, setOpenMenus] = useState<string[]>(["Code Review Agent", "Connections"]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const mounted = useMounted();

  

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
<div className="flex h-14 items-center justify-between gap-2 px-3 border-b border-sidebar-border">
            {mounted ? (
              <div className={cn("min-w-0", isCollapsed ? "w-full" : "flex-1")}>
                <OrgSwitcher collapsed={isCollapsed} />
              </div>
            ) : isCollapsed ? (
              <div className="mx-auto flex w-full items-center justify-center">
                <PixelLogo />
              </div>
            ) : (
              <div className="h-7 w-32 animate-pulse rounded-md bg-muted/30" />
            )}

          <button 
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden text-foreground/70 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-6 scrollbar-none">
          <nav className="space-y-6">
            {navigation.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-1">
                {group.section && !isCollapsed && (
                  <h3 className="px-3 py-2 text-[10px] font-bold tracking-[0.2em] text-foreground/60 uppercase">
                    {group.section}
                  </h3>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)) ||
                      (item.name === "Home" && pathname === "/dashboard")
                    const hasChildren = item.children && item.children.length > 0
                    const isOpen = openMenus.includes(item.name) && !isCollapsed

                    return (
                      <div key={item.name} className="space-y-1">
                        {hasChildren ? (
                          <button
                            onClick={() => toggleMenu(item.name)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-none px-3 py-2 text-xs font-medium transition-colors",
                              isActive 
                                ? "bg-primary text-primary-foreground" 
                                : "text-foreground/75 hover:text-foreground hover:bg-orange-500",
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
                            href={item.locked ? "#" : item.href}
                            onClick={item.locked ? (e) => e.preventDefault() : undefined}
                            className={cn(
                              "flex items-center gap-3 rounded-none px-3 py-2 text-xs font-medium transition-colors",
                              isActive 
                                ? "bg-primary text-primary-foreground" 
                                : "text-foreground/75 hover:text-foreground hover:bg-orange-500",
                              isCollapsed && "justify-center px-0",
                              item.locked && "opacity-60 cursor-not-allowed"
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!isCollapsed && (
                              <>
                                <span>{item.name}</span>
                                {item.locked && <LockKeyhole className="h-3 w-3 text-muted-foreground" />}
                              </>
                            )}
                          </Link>
                        )}
                        
                        {hasChildren && isOpen && !isCollapsed && (
                          <div className="ml-9 space-y-1 border-l border-sidebar-border pl-2">
                            {item.children?.map((child) => (
                              <Link
                                key={child.name}
                                href={child.locked ? "#" : child.href}
                                onClick={child.locked ? (e) => e.preventDefault() : undefined}
                                className={cn(
                                  "flex items-center gap-2 rounded-none px-3 py-2 text-xs transition-colors",
                                  pathname === child.href 
                                    ? "text-foreground font-medium" 
                                    : "text-foreground/65 hover:text-foreground hover:bg-orange-500",
                                  child.locked && "opacity-60 cursor-not-allowed"
                                )}
                              >
                                <span>{child.name}</span>
                                {child.locked && <LockKeyhole className="h-3 w-3 text-muted-foreground" />}
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
            className="flex w-full items-center gap-3 rounded-none px-2 py-2 text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-orange-500 transition-colors group"
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
