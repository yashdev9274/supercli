"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { cn } from "@/lib/utils"

interface DialogContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = createContext<DialogContextType>({
  open: false,
  setOpen: () => {},
})

export function Dialog({
  open: controlled,
  onOpenChange,
  children,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  const [internal, setInternal] = useState(false)
  const open = controlled ?? internal

  const setOpen = useCallback(
    (v: boolean) => {
      setInternal(v)
      onOpenChange?.(v)
    },
    [onOpenChange],
  )

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  )
}

export function DialogTrigger({
  children,
  asChild,
  ...props
}: {
  children: ReactNode
  asChild?: boolean
} & React.HTMLAttributes<HTMLElement>) {
  const { setOpen } = useContext(DialogContext)
  return (
    <div
      onClick={() => setOpen(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
      {...props}
    >
      {children}
    </div>
  )
}

export function DialogContent({
  children,
  className,
  ...props
}: {
  children: ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen } = useContext(DialogContext)
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [render, setRender] = useState(false)

  useEffect(() => {
    if (open) {
      setRender(true)
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
      const timer = setTimeout(() => setRender(false), 150)
      return () => clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, setOpen])

  if (!render) return null

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        "transition-[opacity,backdrop-filter] duration-[var(--dur-enter)] ease-[var(--ease-out)]",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{ backdropFilter: visible ? "blur(4px)" : "blur(0px)" }}
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        ref={ref}
        role="dialog"
        className={cn(
          "bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-lg",
          "w-full max-w-lg max-h-[80vh] overflow-auto",
          "transition-all duration-[var(--dur-enter)] ease-[var(--ease-spring)]",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-[0.96]",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-between px-5 py-4 border-b border-[var(--border)]", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function DialogClose({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useContext(DialogContext)
  return (
    <button
      onClick={() => setOpen(false)}
      className={cn(
        "text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors duration-[var(--dur-quick)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function useDialog() {
  return useContext(DialogContext)
}
