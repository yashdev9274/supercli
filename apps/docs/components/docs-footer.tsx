export function DocsFooter({ slug }: { slug?: string }) {
  return (
    <footer className="mt-16 pt-10 border-t border-[var(--border)]">
      <div className="flex items-start justify-between gap-8">
        {/* Logo */}
        {/* <div className="shrink-0">
          <span className="text-[15px] font-semibold text-white">supercode</span>
        </div> */}

        {/* Links */}
        <div className="flex flex-col gap-3 text-[13px]">
          <a
            href={`https://github.com/yashdev9274/superCli/edit/main/apps/docs/content/docs/${slug || "intro"}.mdx`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit page
          </a>
          <a
            href="https://github.com/yashdev9274/superCli/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Found a bug? Open an issue
          </a>
          <a
            href="#"
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Join our Discord community
          </a>
        </div>

        {/* Copyright & Updated */}
        <div className="shrink-0 text-right text-[13px] text-[var(--muted-foreground)] leading-relaxed">
          <div>© Supercode</div>
          <div className="text-[12px]">Last updated: Jun 5, 2026</div>
        </div>
      </div>
    </footer>
  )
}
