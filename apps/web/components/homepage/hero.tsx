import Link from "next/link"

const conversations = [
  "New agent conversation",
  "hey there",
  "hello there",
  "New agent conversation",
  "New agent conversation",
  "solve this leetcode 2 sum...",
  "in root create a bubble sort...",
  "say hi to sonal on sonal@30...",
  "web search about current in...",
  "mail 'hi yash' to yashdewas...",
]

const files = [
  ["›", ".agents", "folder"],
  ["›", ".claude", "folder"],
  ["›", ".cursor", "folder"],
  ["›", ".github", "folder"],
  ["›", ".opencode", "folder"],
  ["›", ".vscode", "folder"],
  ["›", "(auth)", "folder"],
  ["›", "apps", "folder"],
  ["›", "packages", "folder"],
  ["›", "scripts", "folder"],
  ["›", "skills", "folder"],
  ["›", "supercode-openmodel", "folder"],
  ["", ".bun-version", "file"],
  ["", ".env.example", "file"],
  ["", ".gitignore", "file"],
  ["", "AGENTS.md", "file"],
  ["", "bun.lock", "file"],
  ["", "CHANGELOG.md", "file"],
  ["", "README.md", "file"],
  ["", "package.json", "file"],
  ["", "turbo.json", "file"],
]

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3.5">
      <path d="M3.5 12.5 12.5 3.5M5 3.5h7.5V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ToolRow({
  number,
  action,
  target,
  status = "completed",
  duration,
}: {
  number: number
  action: string
  target: string
  status?: string
  duration: string
}) {
  return (
    <div className="flex h-7 items-center rounded-md border border-dashed border-white/10 bg-white/[0.018] px-2.5 font-mono text-[8px]">
      <span className="mr-2 text-primary">▣</span>
      <span className="font-semibold text-white/70">{number}. {action}</span>
      <span className="ml-2 text-white/34">{target}</span>
      <span className="ml-auto text-white/56">{status}</span>
      <span className="ml-1 text-white/23">{duration}</span>
      <span className="ml-2 text-white/24">›</span>
    </div>
  )
}

function DesktopAppPreview() {
  return (
    <div className="relative mx-auto w-[1200px] origin-top overflow-hidden rounded-[13px] border border-white/14 bg-[#101011] text-left shadow-[0_40px_120px_rgba(0,0,0,0.6)] max-lg:scale-[0.79] max-md:scale-[0.59] max-sm:scale-[0.395]">
      <div className="flex h-[660px] font-sans text-[10px] text-white/55">
        <aside className="relative w-[174px] shrink-0 border-r border-white/8 bg-[#171719]">
          <div className="flex h-12 items-start gap-2 px-2.5 pt-2.5">
            <span className="size-2 rounded-full bg-[#ff5f57]" />
            <span className="size-2 rounded-full bg-[#febc2e]" />
            <span className="size-2 rounded-full bg-[#28c840]" />
            <span className="ml-auto mt-5 text-white/30">▣</span>
          </div>

          <div className="space-y-1 px-2">
            <div className="flex h-7 items-center gap-2 rounded-md bg-white/[0.025] px-2 text-white/82"><span>⌂</span><span className="font-semibold">Home</span></div>
            <div className="flex h-7 items-center gap-2 px-2 text-white/48"><span>↟</span><span>Review</span></div>
            <div className="flex h-7 items-center gap-2 rounded-md border border-white/8 px-2 text-white/78"><span>□</span><span className="font-semibold">New Chat</span></div>
            <div className="flex h-7 items-center gap-2 rounded-md border border-white/7 px-2 text-white/42"><span>♲</span><span>Clear session</span></div>
            <div className="flex h-7 items-center gap-2 rounded-md border border-white/7 px-2 text-white/32"><span>⌕</span><span>Search</span></div>
          </div>

          <div className="mt-2 px-2">
            <div className="flex h-6 items-center justify-between px-1 text-[8px] text-white/30"><span>Projects</span><span>101</span></div>
            {conversations.map((conversation, index) => (
              <div key={`${conversation}-${index}`} className={`flex h-[27px] items-center gap-2 rounded-md px-1.5 py-[6px] ${index === 5 ? "border border-white/6 bg-white/[0.035] text-white/75" : "text-white/38"}`}>
                <span className={index === 5 ? "text-primary" : "text-white/26"}>▭</span>
                <span className="min-w-0 flex-1 truncate">{conversation}</span>
                <span className="font-mono text-[7px] text-white/28">A</span>
              </div>
            ))}
          </div>

          <div className="absolute inset-x-0 bottom-0 flex h-10 items-center gap-2 border-t border-white/8 bg-[#171719] px-2.5">
            <span className="flex size-5 items-center justify-center rounded-full bg-white text-[7px] font-bold text-black">YD</span>
            <div className="min-w-0"><div className="truncate text-[8px] font-semibold text-white/76">Yash Dewasthale</div><div className="truncate text-[7px] text-white/28">yashdev.ywd@gmail.com</div></div>
            <span className="ml-auto text-white/25">⌃</span>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center border-b border-white/8 bg-[#171719] px-3">
            <div className="flex items-center gap-1.5 text-[8px]"><span className="text-white/38">dev</span><span className="text-white/20">›</span><span className="text-white/38">saas</span><span className="text-white/20">›</span><span className="font-semibold text-white/76">supercli</span></div>
            <span className="ml-3 rounded-full border border-white/8 px-2 py-1 font-mono text-[7px] text-white/38">⑂ supercode-cli</span>
            <div className="ml-auto flex items-center gap-3"><span className="rounded-full border border-white/10 px-2.5 py-1 text-[8px] font-semibold text-white/72">□ New Chat</span><span className="font-mono text-[7px] text-white/30">Ready</span><span className="text-primary">▥</span></div>
          </header>

          <div className="flex min-h-0 flex-1">
            <main className="flex min-w-0 flex-1 flex-col bg-[#101011]">
              <div className="min-h-0 flex-1 px-4 pt-3">
                <div className="ml-auto flex h-9 max-w-[670px] items-center rounded-lg bg-white/[0.075] px-3 text-[9px] text-white/76">Follow-up: Can you come up with an algorithm that is less than O(n2) time complexity?</div>

                <div className="mt-3 space-y-2.5 px-1">
                  <div className="flex items-center gap-2 font-mono text-[8px] text-white/26"><span className="text-white/70">›</span><span>◉ Analysis</span></div>
                  <div className="flex items-center gap-2 font-mono text-[8px] text-white/26"><span className="text-white/70">›</span><span>◉ Analysis</span></div>
                  <ToolRow number={1} action="SHELL" target="ls -la" duration="0.1s" />
                  <div className="flex items-center gap-2 font-mono text-[8px] text-white/26"><span className="text-white/70">›</span><span>◉ Analysis</span></div>
                  <div className="flex items-center gap-2 font-mono text-[8px] text-white/26"><span className="text-white/70">›</span><span>◉ Analysis</span></div>
                  <ToolRow number={2} action="WRITE" target="twoSum2.py" duration="0.1s" />
                  <div className="flex items-center gap-2 font-mono text-[8px] text-white/26"><span className="text-white/70">›</span><span>◉ Analysis</span></div>
                  <ToolRow number={3} action="SHELL" target="python3 twoSum2.py" status="failed" duration="1.1s" />
                  <div className="flex items-center gap-2 font-mono text-[8px] text-white/26"><span className="text-white/70">›</span><span>◉ Analysis</span></div>
                  <div className="rounded-md border border-white/8 bg-white/[0.012] p-2.5"><div className="mb-1 font-mono text-[8px] font-semibold text-emerald-400">▤ Result</div><div className="text-[9px] text-white/75">The assertion was wrong — [1, 5, 5, 5] with target 10 correctly returns [1, 2] (two distinct indices both holding 5). Let me fix the test.</div></div>
                  <ToolRow number={4} action="EDIT" target="twoSum2.py" duration="27.4s" />
                  <div className="flex items-center gap-2 font-mono text-[8px] text-white/26"><span className="text-white/70">›</span><span>◉ Analysis</span></div>
                  <ToolRow number={5} action="SHELL" target="python3 twoSum2.py" duration="0.1s" />
                </div>
              </div>

              <div className="mx-3 mb-3 h-[142px] shrink-0 rounded-xl border border-white/10 bg-[#141416] p-3">
                <div className="text-[9px] text-white/25">Ask to make changes, @mention files, run /commands</div>
                <div className="mt-[82px] flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full border border-white/10 text-white/40">+</span><span className="flex size-5 items-center justify-center rounded-full border border-white/10 text-white/38">⌁</span><span className="font-semibold text-white/76">ϟ Agent</span><span className="ml-auto">⌄</span><span className="font-semibold text-white/66">▦ OpenCode · ling-3.0-flash-fin-free</span><span className="ml-auto">⌄</span><span className="text-white/70">◉ High</span><span className="ml-auto">⌄</span><span className="flex size-5 items-center justify-center rounded-full bg-white/8 text-white/22">↑</span></div>
              </div>
            </main>

            <aside className="w-[208px] shrink-0 border-l border-white/8 bg-[#171719]">
              <div className="flex h-9 items-center gap-4 border-b border-white/7 px-2.5 text-[8px] font-semibold"><span className="rounded-md bg-white/7 px-2 py-1.5 text-white/78">All files</span><span className="text-white/30">Changes <span className="ml-1">0</span></span><span className="ml-auto text-white/30">↻</span></div>
              <div className="p-2">
                <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-white/8 p-2"><span className="flex size-6 items-center justify-center rounded bg-primary/10 text-primary">■</span><div><div className="font-semibold text-white/72">supercli</div><div className="font-mono text-[7px] text-white/26">supercode-cli</div></div></div>
                <div className="space-y-[1px] font-mono text-[8px]">
                  {files.map(([marker, name, type]) => (
                    <div key={name} className="flex items-center gap-1.5 px-1.5 py-[3px] text-white/43"><span className="w-2 text-white/28">{marker}</span><span className={type === "folder" ? "text-primary" : "text-sky-300/70"}>{type === "folder" ? "▬" : "▧"}</span><span>{name}</span></div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-border px-4 pt-[190px] sm:pt-[210px]">
      <div className="relative mx-auto flex max-w-[1180px] flex-col items-center text-center">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.28em] text-primary sm:text-[11px]">
          The AI software engineer
        </p>

        <h1 className="mt-7 max-w-[980px] text-balance text-[48px] font-medium leading-[0.98] tracking-[-0.055em] text-white sm:text-[70px] lg:text-[88px]">
          Meet Nova.
          <span className="block text-white/56">Your engineering team, multiplied.</span>
        </h1>

        <p className="mt-7 max-w-[620px] text-pretty text-[15px] leading-7 text-white/48 sm:text-[17px]">
          Nova plans, writes, reviews, and ships production code from your desktop—working across your codebase with the tools and models you already trust.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/download"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-5 text-[13px] font-semibold text-black transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hoverable:hover:bg-white/90 active:scale-[0.97]"
          >
            Download for Mac
            <ArrowIcon />
          </Link>
          <a
            href="https://cal.com/yash-dewasthale/talk-to-founder"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/14 bg-white/[0.025] px-5 text-[13px] font-medium text-white/76 transition-[transform,background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hoverable:hover:border-white/24 hoverable:hover:bg-white/5 active:scale-[0.97]"
          >
            Book a Demo
            <ArrowIcon />
          </a>
        </div>

        <div className="relative mt-20 h-[265px] w-full sm:h-[390px] md:h-[510px] lg:h-[610px]">
          <div className="absolute left-1/2 top-0 w-[1200px] -translate-x-1/2">
            <DesktopAppPreview />
          </div>
        </div>
      </div>
    </section>
  )
}
