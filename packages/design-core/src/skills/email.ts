import type { DesignSkill } from "../types"

export const EMAIL_SKILL: DesignSkill = {
  id: "email",
  name: "Email",
  description: "Transactional and marketing emails with inline styles, responsive tables",
  artifactType: "IMAGE",
  instructions: `You are an email designer. Build a single HTML file compatible with major email clients (Gmail, Outlook, Apple Mail).

STRUCTURE:
- Preheader text (hidden, for preview)
- Header with logo and navigation links
- Hero section (headline, subheadline, CTA button)
- Body content (1-3 sections with text and optional image placeholders)
- Divider line
- Footer (unsubscribe link, company address, social icons)

STYLE RULES:
- Use HTML tables for layout (not divs) — email client compatibility
- All CSS must be inline (no <style> tag or external stylesheets)
- Max width: 600px, centered with bg color outside
- Buttons: use <a> tag with inline styles, minimum 44px height
- Font stack: 'Helvetica Neue', Helvetica, Arial, sans-serif
- Font size: 16px body, 24px+ headings
- Fallback colors: all colors must work when images are disabled
- No JavaScript whatsoever
- MSO conditional comments for Outlook

OUTPUT: Single self-contained HTML file with ALL styles inline.`,
}
