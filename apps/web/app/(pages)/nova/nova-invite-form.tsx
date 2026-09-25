"use client"

import { useState, useTransition, type FormEvent } from "react"
import { Check, LoaderCircle } from "lucide-react"

import { SendHorizontalIcon } from "@/components/animate-ui/icons/send-horizontal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type FormStatus =
  | { type: "idle"; message: "" }
  | { type: "success" | "error"; message: string }

export function NovaInviteForm() {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<FormStatus>({ type: "idle", message: "" })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    startTransition(async () => {
      setStatus({ type: "idle", message: "" })

      try {
        const response = await fetch("/api/nova/early-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.get("name"),
            role: formData.get("role"),
            email: formData.get("email"),
            website: formData.get("website"),
          }),
        })
        const result = (await response.json()) as {
          message?: string
          error?: string
        }

        if (!response.ok) {
          setStatus({
            type: "error",
            message: result.error || "Something went wrong. Please try again.",
          })
          return
        }

        form.reset()
        setStatus({
          type: "success",
          message: result.message || "You’re on Nova’s early invite list.",
        })
      } catch {
        setStatus({
          type: "error",
          message: "We couldn’t reach Nova. Please try again.",
        })
      }
    })
  }

  const fieldClassName =
    "h-11 rounded-lg border-white/[0.09] bg-black/20 px-3.5 text-sm shadow-inner shadow-black/10 transition-[border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] placeholder:text-muted-foreground/30 focus-visible:border-primary/45 focus-visible:bg-black/30 focus-visible:ring-2 focus-visible:ring-primary/10 disabled:opacity-50"

  return (
    <form onSubmit={handleSubmit} className="p-5 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nova-name" className="font-mono text-[11px] uppercase tracking-[0.12em] text-foreground/65">
            Name
          </Label>
          <Input
            id="nova-name"
            name="name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            minLength={2}
            maxLength={100}
            required
            disabled={isPending}
            className={fieldClassName}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nova-role" className="font-mono text-[11px] uppercase tracking-[0.12em] text-foreground/65">
            Role
          </Label>
          <Input
            id="nova-role"
            name="role"
            autoComplete="organization-title"
            placeholder="Engineering lead"
            minLength={2}
            maxLength={120}
            required
            disabled={isPending}
            className={fieldClassName}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="nova-email" className="font-mono text-[11px] uppercase tracking-[0.12em] text-foreground/65">
            Work email
          </Label>
          <Input
            id="nova-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            maxLength={254}
            required
            disabled={isPending}
            className={fieldClassName}
          />
        </div>

        <div className="absolute -left-[9999px]" aria-hidden="true">
          <Label htmlFor="nova-website">Website</Label>
          <Input
            id="nova-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={isPending}
          className="group mt-2 h-12 w-full rounded-lg font-mono text-xs uppercase tracking-[0.08em] shadow-[0_18px_45px_-24px_hsl(var(--primary))] transition-[transform,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] sm:col-span-2"
        >
          {isPending ? (
            <>
              <span className="animate-spin motion-reduce:animate-none">
                <LoaderCircle />
              </span>
              Sending request
            </>
          ) : (
            <>
              Request early access
              <SendHorizontalIcon size={16} aria-hidden="true" />
            </>
          )}
        </Button>
      </div>

      <div aria-live="polite" className="min-h-12 pt-4">
        {status.type === "success" ? (
          <p className="flex items-start gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.055] px-3 py-2.5 text-sm leading-relaxed text-emerald-300">
            <Check className="mt-0.5 size-4 shrink-0" />
            {status.message}
          </p>
        ) : null}
        {status.type === "error" ? (
          <p className="rounded-lg border border-red-400/15 bg-red-400/[0.055] px-3 py-2.5 text-sm leading-relaxed text-red-300">
            {status.message}
          </p>
        ) : null}
      </div>

      <p className="flex items-center justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground/50">
        <span className="size-1 rounded-full bg-primary/60" aria-hidden="true" />
        No noise. Only meaningful Nova updates.
      </p>
    </form>
  )
}
