import { DocsHeader } from "@/components/docs-header"
import { DocsSidebar } from "@/components/docs-sidebar"

export default function DocsLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <DocsHeader />
      <div className="flex flex-1">
        <DocsSidebar />
        <main className="flex-1 min-w-0 py-10 px-6 sm:px-10 lg:px-14 max-w-4xl">
          {children}
        </main>
      </div>
    </div>
  )
}
