"use client"

import { ChevronDown } from "lucide-react"

export function ComputerUseSection() {
  return (
    <div className="max-w-[640px]">
      <p className="text-[12px] text-[#8a8a8a]">Settings for <span className="text-[#e8e8e8]">this computer</span></p>
      <div className="mt-5 flex items-center gap-2">
        <h1 className="text-[22px] font-medium tracking-[-0.025em]">Computer use</h1>
        <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] text-[#8a8a8a]">Beta</span>
      </div>
      <p className="mt-2 text-[13px] leading-5 text-[#8a8a8a]">Manage desktop access and review computer-use information.</p>

      <div className="mt-9">
        <h2 className="text-[13px] text-[#a0a0a0]">Computer control</h2>
        <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="font-medium">Unavailable in web settings</p>
          <p className="mt-1 leading-5 text-[#8a8a8a]">Desktop control and its settings can’t be managed from this page. This page can’t check the computer’s connection or permissions.</p>
        </div>
      </div>

      <div className="mt-7 space-y-2">
        <Disclosure title="Getting started">
          <p>Computer use requires a supported desktop connection and the appropriate operating system permissions. This web page cannot set up or verify that access.</p>
        </Disclosure>
        <Disclosure title="Recent computer actions">
          <p>Computer action history is not available in web settings.</p>
        </Disclosure>
        <Disclosure title="Advanced">
          <p>Permission status and desktop capabilities are not available in web settings. Check permissions in your operating system’s settings.</p>
        </Disclosure>
      </div>
    </div>
  )
}

function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-white/[0.06] py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[#a0a0a0] hover:text-white [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 leading-5 text-[#8a8a8a]">{children}</div>
    </details>
  )
}
