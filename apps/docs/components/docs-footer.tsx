import Link from "next/link"
import { getPrevNext } from "@/lib/docs-content"

export function DocsFooter({ slug }: { slug?: string }) {
  const nav = getPrevNext(slug || "intro")

  return (
    <footer className="mt-16 pt-8 border-t border-[var(--border)]">
      <div className="flex items-center justify-between mb-10">
        <div>
          {nav.prev ? (
            <Link
              href={`/docs/${nav.prev.slug}`}
              className="group flex flex-col gap-0.5 transition-all duration-150 active:scale-[0.97]"
            >
              <span className="text-[12px] text-[var(--muted-foreground)] font-mono">← Previous</span>
              <span className="text-[14px] text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors 150ms var(--ease-out)">
                {nav.prev.title}
              </span>
            </Link>
          ) : (
            <div />
          )}
        </div>
        <div className="text-right">
          {nav.next ? (
            <Link
              href={`/docs/${nav.next.slug}`}
              className="group flex flex-col gap-0.5 transition-all duration-150 active:scale-[0.97]"
            >
              <span className="text-[12px] text-[var(--muted-foreground)] font-mono">Next →</span>
              <span className="text-[14px] text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors 150ms var(--ease-out)">
                {nav.next.title}
              </span>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-[13px]">
          <a
            href="https://github.com/yashdev9274/superCli/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors 150ms var(--ease-out) active:scale-[0.97]"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Report an issue
          </a>
          <span className="text-[var(--border)]">|</span>
          <a
            href="https://supercli.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors 150ms var(--ease-out) active:scale-[0.97]"
          >
            supercli.vercel.app
          </a>
        </div>
        <div className="text-[12px] text-[var(--muted-foreground)]">
          © Supercode
        </div>
      </div>
    </footer>
  )
}
