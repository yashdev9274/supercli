import { notFound } from "next/navigation"
import { MDXRemote } from "next-mdx-remote/rsc"
import { getDocBySlug, getDocSlugs, DOCS_NAV } from "@/lib/docs-content"
import { extractHeadings, getHeadingText, slugify } from "@/lib/utils"
import { OnThisPage } from "@/components/on-this-page"

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const slugs = getDocSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const doc = getDocBySlug(slug)
  if (!doc) return { title: "Docs | Supercode" }
  const title = (doc.meta.title as string) || DOCS_NAV.find((n) => n.slug === slug)?.title || slug
  return { title: `${title} | Docs | Supercode` }
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
  }

  return (
    <div className="flex gap-12 w-full max-w-5xl">
      <article className="docs-prose min-w-0 flex-1">
        <MDXRemote source={doc.content} components={components} />
      </article>
      <OnThisPage headings={headings} />
    </div>
  )
}
