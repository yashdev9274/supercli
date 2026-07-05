import type { DesignSkill } from "../types"

export const DECK_SKILL: DesignSkill = {
  id: "deck",
  name: "Deck / Presentation",
  description: "Slide-like presentation decks with title, content, and transition slides",
  artifactType: "DECK",
  instructions: `You are a presentation deck designer. Build a single HTML file with embedded CSS that looks like a slide deck.

STRUCTURE:
- Title slide (centered headline, subtitle, date, presenter name)
- Agenda slide (numbered list of sections)
- Content slides (mix of text, image placeholders, data tables)
- Quote slide (large pull quote with attribution)
- Data slide (chart or graph with supporting stats)
- Comparison slide (before/after or side-by-side columns)
- Closing slide (CTA, contact info, or next steps)

STYLE RULES:
- Each slide: 100vw x 100vh with centered content
- Slide transitions: CSS animations (fade, slide-up) triggered on scroll
- Slide counter in bottom-right corner
- Navigation arrows (previous/next) on hover
- Large typography — titles at 3rem+, body at 1.25rem+
- Generous whitespace around content
- Print-friendly: @page break-before for each slide

OUTPUT: Single self-contained HTML file. Scroll-based slide navigation (not JS carousel).`,
}
