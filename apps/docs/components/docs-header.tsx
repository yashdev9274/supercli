import Link from "next/link"

const PixelLogo = () => {
  return (
    <svg width="70" height="22" viewBox="0 0 70 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* D */}
      <rect x="0" y="0" width="4" height="4" rx="0.5" fill="#a1a1aa"/>
      <rect x="5" y="0" width="4" height="4" rx="0.5" fill="#a1a1aa"/>
      <rect x="10" y="0" width="4" height="4" rx="0.5" fill="#a1a1aa"/>
      <rect x="0" y="5" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="14" y="5" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="0" y="10" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="14" y="10" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="0" y="15" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="14" y="15" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="0" y="20" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="5" y="20" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="10" y="20" width="4" height="4" rx="0.5" fill="#52525b"/>

      {/* O */}
      <rect x="22" y="0" width="4" height="4" rx="0.5" fill="#a1a1aa"/>
      <rect x="26" y="0" width="4" height="4" rx="0.5" fill="#a1a1aa"/>
      <rect x="30" y="0" width="4" height="4" rx="0.5" fill="#a1a1aa"/>
      <rect x="20" y="5" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="33" y="5" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="20" y="10" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="33" y="10" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="20" y="15" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="33" y="15" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="22" y="20" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="26" y="20" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="30" y="20" width="4" height="4" rx="0.5" fill="#52525b"/>

      {/* C */}
      <rect x="41" y="0" width="4" height="4" rx="0.5" fill="#a1a1aa"/>
      <rect x="45" y="0" width="4" height="4" rx="0.5" fill="#a1a1aa"/>
      <rect x="49" y="0" width="4" height="4" rx="0.5" fill="#a1a1aa"/>
      <rect x="40" y="5" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="40" y="10" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="40" y="15" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="41" y="20" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="45" y="20" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="49" y="20" width="4" height="4" rx="0.5" fill="#52525b"/>

      {/* S */}
      <rect x="58" y="0" width="4" height="4" rx="0.5" fill="#a1a1aa"/>
      <rect x="62" y="0" width="4" height="4" rx="0.5" fill="#a1a1aa"/>
      <rect x="66" y="0" width="4" height="4" rx="0.5" fill="#a1a1aa"/>
      <rect x="56" y="5" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="58" y="10" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="62" y="10" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="66" y="10" width="4" height="4" rx="0.5" fill="#71717a"/>
      <rect x="67" y="15" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="58" y="20" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="62" y="20" width="4" height="4" rx="0.5" fill="#52525b"/>
      <rect x="66" y="20" width="4" height="4" rx="0.5" fill="#52525b"/>
    </svg>
  );
};

export function DocsHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/80">
      <div className="flex h-14 items-center justify-between px-6">
        <Link
          href="/"
          className="font-semibold text-[var(--foreground)] hover:opacity-80"
        >
          <PixelLogo/>
        </Link>
        <nav className="flex items-center gap-5 text-[13px]">
          <a
            href="/docs/intro"
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Docs
          </a>
          <a
            href="https://supercli.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Supercode
          </a>
          <a
            href="https://github.com/yashdev9274/superCli"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  )
}
