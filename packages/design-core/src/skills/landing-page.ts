import type { DesignSkill } from "../types"

export const LANDING_PAGE_SKILL: DesignSkill = {
  id: "landing-page",
  name: "Landing Page",
  description: "Single-page marketing sites with hero, features, pricing, and CTA sections",
  artifactType: "PROTOTYPE",
  instructions: `You are a landing page designer. Build a single HTML file with embedded CSS.

STRUCTURE:
- Hero section with headline, subheadline, and primary CTA button
- Social proof / trust bar (logos, testimonials, or stats)
- Features section (3-column grid with icons or illustrations)
- How it works (optional, numbered steps)
- Pricing section (3-tier cards with feature lists)
- FAQ section (accordion-style)
- Footer with links and copyright

STYLE RULES:
- Hero should occupy full viewport height (100vh)
- Use sticky header with blur backdrop on scroll
- Cards should have hover lift effects (transform + shadow)
- Smooth scroll between sections
- Mobile-responsive with hamburger menu
- Max content width: 1200px, centered with mx-auto
- Use CSS Grid for feature cards, Flexbox for nav

OUTPUT: Single self-contained HTML file. No external dependencies except Google Fonts or system fonts.`,
}
