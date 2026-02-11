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
        <main className="flex-1 min-w-0 py-8 px-8 lg:px-12 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
