import { notFound } from "next/navigation"
import { MDXRemote } from "next-mdx-remote/rsc"
import { getDocBySlug } from "@/lib/docs-content"
import { getNavSlugs } from "@/lib/docs-content"
import { extractHeadings, getHeadingText, slugify } from "@/lib/utils"
import { OnThisPage } from "@/components/on-this-page"
import { TerminalBlock } from "@/components/terminal-block"
import { DocsFooter } from "@/components/docs-footer"

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const slugs = getNavSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const doc = getDocBySlug(slug)
  if (!doc) return { title: "Docs | Supercode" }

  const title = (doc.meta.title as string) || slug
  const description = (doc.meta.description as string) || "Supercode documentation"

  return {
    title: `${title} | Supercode Docs`,
    description,
  }
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params
  const doc = getDocBySlug(slug)
  if (!doc) notFound()

  const headings = extractHeadings(doc.content)

  const components = {
    h2: ({ children, ...props }: React.ComponentProps<"h2">) => (
      <h2 id={slugify(getHeadingText(children))} {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: React.ComponentProps<"h3">) => (
      <h3 id={slugify(getHeadingText(children))} {...props}>
        {children}
      </h3>
    ),
    pre: ({ children }: React.ComponentProps<"pre">) => (
      <TerminalBlock>{children}</TerminalBlock>
    ),
  }

  return (
    <div className="flex justify-center gap-12">
      <article className="docs-prose min-w-0 w-full max-w-3xl">
        <MDXRemote source={doc.content} components={components} />
        <DocsFooter slug={slug} />
      </article>
      <OnThisPage headings={headings} />
    </div>
  )
}
