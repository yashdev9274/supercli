"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import { Check, ChevronDown, Search } from "lucide-react"

import { ChatGPTConnectionCard } from "@/modules/nova-web/components/chatgpt-connection-card"
import { CodexDeviceConnectionCard } from "@/modules/nova-web/components/codex-device-connection-card"
import { filterSettingsModels, PROVIDER_CONFIGURATION } from "@/modules/nova-web/model-settings"
import { modelLogo, PROVIDER_LOGOS, type BrandLogo } from "@/modules/nova-web/model-logos"
import { HARNESS_PROVIDERS, menuId, type HarnessProvider, type NovaModelEntry } from "@/modules/nova-web/models"
import { useCodexCatalog } from "@/modules/nova-web/codex-catalog"

export function ModelsSection({ provider, model, onUseModel }: {
  provider: HarnessProvider
  model: string
  onUseModel: (selection: { provider: HarnessProvider; model: string }) => void
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<HarnessProvider | "all">("all")
  const [expanded, setExpanded] = useState<string | null>(null)
  const codex = useCodexCatalog()
  const catalog = useMemo(() => filterSettingsModels("", "all", codex.models), [codex.models])
  const models = useMemo(() => filterSettingsModels(query, filter, codex.models), [query, filter, codex.models])

  return (
    <div>
      <h1 className="text-[28px] font-medium tracking-tight">Models</h1>
      <p className="mt-2 text-[13px] leading-5 text-[#8a8a8a]">Every model and provider in Nova, with the configuration that serves it.</p>

      <CodexDeviceConnectionCard />
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-[#8a8a8a]">
        {codex.loading ? <p role="status">Loading Codex account models…</p>
          : codex.error ? <p role="alert" className="text-amber-300">{codex.error}</p>
          : !codex.connected ? <p>Connect Codex to load your account’s models.</p>
          : <p>{codex.models.length ? `${codex.models.length} Codex account models available.` : "No models available for this Codex account."}</p>}
        <button type="button" disabled={codex.loading} onClick={codex.retry} className="shrink-0 rounded-md border border-white/10 px-2.5 py-1 hover:bg-white/5 disabled:opacity-50">Refresh Codex models</button>
      </div>
      <details className="mt-5 text-[12px] text-[#8a8a8a]">
        <summary className="cursor-pointer hover:text-[#ededed]">Advanced · Local Codex companion</summary>
        <ChatGPTConnectionCard />
      </details>

      <section aria-labelledby="providers-heading" className="mt-10">
        <h2 id="providers-heading" className="text-[13px] font-medium">Providers & connections</h2>
        <p className="mt-1 text-[12px] leading-5 text-[#8a8a8a]">Credentials are managed on the harness server. Configuration below does not verify connectivity or plan access.</p>
        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#171717]">
          {HARNESS_PROVIDERS.map((item) => (
            <details key={item.id} className="group border-b border-white/[0.07] last:border-b-0">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 focus-visible:outline-2 focus-visible:outline-[#2dd4bf] [&::-webkit-details-marker]:hidden">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[#a0a0a0]">
                  <CompanyLogo logo={PROVIDER_LOGOS[item.id]} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px]">{item.label}</span>
                  <span className="mt-0.5 block text-[12px] text-[#8a8a8a]">{catalog.filter((entry) => entry.provider === item.id).length} models · {item.id === "codex" ? "ChatGPT subscription" : item.isCloud ? "Managed cloud" : "Harness credential"}</span>
                </span>
                <ChevronDown className="size-3.5 text-[#8a8a8a] transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-white/[0.05] bg-black/10 px-4 py-4 text-[12px] leading-5 sm:pl-[60px]">
                <p className="text-[#a0a0a0]">{PROVIDER_CONFIGURATION[item.id].description}</p>
                <dl className="mt-3 space-y-2">
                  <div><dt className="text-[#8a8a8a]">Provider ID</dt><dd className="font-mono text-[#d0d0d0]">{item.id}</dd></div>
                  <div><dt className="text-[#8a8a8a]">{item.id === "codex" ? "Connection" : "Harness environment variable"}</dt><dd className="break-all font-mono text-[#d0d0d0]">{PROVIDER_CONFIGURATION[item.id].credential}</dd></div>
                  {PROVIDER_CONFIGURATION[item.id].baseUrl ? <div><dt className="text-[#8a8a8a]">Branch URL environment variable</dt><dd className="break-all font-mono text-[#d0d0d0]">{PROVIDER_CONFIGURATION[item.id].baseUrl}</dd></div> : null}
                  <div><dt className="text-[#8a8a8a]">Transport</dt><dd className="font-mono text-[#d0d0d0]">{item.id === "codex" ? "Nova backend · Codex Responses SSE" : "POST /api/ai/chat · NDJSON streaming"}</dd></div>
                </dl>
                <button type="button" onClick={() => { setFilter(item.id); setQuery("") }} className="mt-3 rounded-md border border-white/10 px-2.5 py-1 text-[#d0d0d0] hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#2dd4bf]">Show models</button>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="model-catalog-heading" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="model-catalog-heading" className="text-[13px] font-medium">Models</h2>
            <p className="mt-1 text-[12px] text-[#8a8a8a]">{catalog.length} catalog entries across {HARNESS_PROVIDERS.length} providers</p>
          </div>
          <span className="text-[11px] text-[#8a8a8a]">{models.length} shown</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-[#171717] px-3">
            <Search aria-hidden="true" className="size-3.5 shrink-0 text-[#8a8a8a]" />
            <input aria-label="Search models" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models or providers…" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#777]" />
          </label>
          <select aria-label="Filter by provider" value={filter} onChange={(event) => setFilter(event.target.value as HarnessProvider | "all")} className="h-9 max-w-full rounded-lg border border-white/[0.08] bg-[#171717] px-3 text-[12px] outline-none focus-visible:outline-2 focus-visible:outline-[#2dd4bf]">
            <option value="all">All providers</option>
            {HARNESS_PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#171717] p-2">
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <caption className="sr-only">Nova models and their provider configuration</caption>
            <thead className="bg-white/[0.04] text-[#999]">
              <tr>{["Model", "Served by", "Cost multiplier", ""].map((heading, index) => <th key={index} scope="col" className="px-3 py-2 font-normal first:rounded-l-lg last:rounded-r-lg">{heading || <span className="sr-only">Configuration</span>}</th>)}</tr>
            </thead>
            <tbody>
              {models.map((entry) => {
                const id = menuId(entry)
                const selected = provider === entry.provider && model === entry.id
                return (
                  <ModelRow key={id} entry={entry} selected={selected} expanded={expanded === id} onExpand={() => setExpanded(expanded === id ? null : id)} onUse={() => onUseModel({ provider: entry.provider, model: entry.id })} />
                )
              })}
              {models.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-[#999]">{filter === "codex" && !codex.models.length ? codex.loading ? "Loading account models…" : codex.error ? "Could not load Codex models. Retry above." : codex.connected ? "No models available for this account." : "Connect Codex to see your account models." : "No models match your search."}</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-[#8a8a8a]">Multipliers are catalog values, not USD token prices. Context windows, compaction thresholds, and per-token pricing are not published in Nova’s catalog. Selecting a model does not verify provider access.</p>
      </section>
    </div>
  )
}

function CompanyLogo({ logo }: { logo: BrandLogo }) {
  if (logo.monochrome) {
    return <span aria-hidden="true" className="size-4 shrink-0 bg-current opacity-75" style={{ maskImage: `url(${logo.src})`, maskSize: "contain", maskPosition: "center", maskRepeat: "no-repeat" }} />
  }
  return <Image src={logo.src} alt="" width={16} height={16} unoptimized className="size-4 shrink-0 rounded-[2px] object-contain" />
}

function ModelRow({ entry, selected, expanded, onExpand, onUse }: {
  entry: NovaModelEntry
  selected: boolean
  expanded: boolean
  onExpand: () => void
  onUse: () => void
}) {
  const provider = HARNESS_PROVIDERS.find((item) => item.id === entry.provider)
  if (!provider) return null
  return (
    <>
      <tr className="border-b border-white/[0.04] text-[#a0a0a0] hover:bg-white/[0.02]">
        <td className="px-3 py-3.5">
          <span className="flex items-center gap-2 text-[#d0d0d0]"><CompanyLogo logo={modelLogo(entry)} />{entry.label}{selected ? <Check aria-label="Selected model" className="size-3.5 shrink-0 text-[#2dd4bf]" /> : null}</span>
        </td>
        <td className="px-3 py-3.5"><span className="flex items-center gap-2"><CompanyLogo logo={PROVIDER_LOGOS[entry.provider]} />{provider.shortLabel}</span></td>
        <td className="px-3 py-3.5 tabular-nums">{entry.cost ?? "—"}</td>
        <td className="px-2 py-3.5 text-right"><button type="button" aria-label={`Configure ${entry.label} via ${provider.label}`} aria-expanded={expanded} onClick={onExpand} className="rounded-md p-1.5 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#2dd4bf]"><ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} /></button></td>
      </tr>
      {expanded ? (
        <tr><td colSpan={4} className="border-b border-white/[0.06] bg-black/15 px-4 py-4">
          <p className="text-[13px] text-[#d0d0d0]">{entry.desc}</p>
          <dl className="mt-3 grid gap-3 text-[12px] sm:grid-cols-2">
            <div><dt className="text-[#888]">Model ID</dt><dd className="mt-1 break-all font-mono text-[#c0c0c0]">{entry.id}</dd></div>
            <div><dt className="text-[#888]">Provider</dt><dd className="mt-1 text-[#c0c0c0]">{provider.label} · {entry.provider}</dd></div>
            <div className="sm:col-span-2"><dt className="text-[#888]">Harness credential</dt><dd className="mt-1 break-all font-mono text-[#c0c0c0]">{PROVIDER_CONFIGURATION[entry.provider].credential}</dd></div>
          </dl>
          <button type="button" onClick={onUse} className="mt-4 rounded-lg border border-[#2dd4bf]/30 bg-[#2dd4bf]/10 px-3 py-1.5 text-[12px] text-[#2dd4bf] hover:bg-[#2dd4bf]/20 focus-visible:outline-2 focus-visible:outline-[#2dd4bf]">{selected ? "Continue with this model" : "Use model"}</button>
        </td></tr>
      ) : null}
    </>
  )
}
