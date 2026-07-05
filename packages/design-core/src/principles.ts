import type { DesignPrinciple } from "./types"

export const DESIGN_PRINCIPLES: DesignPrinciple[] = [
  {
    title: "60-30-10 Color Rule",
    description:
      "60% neutral/dominant color (backgrounds, large areas), 30% secondary color (UI elements, headers), 10% accent color (CTAs, highlights). Maintains visual balance without overwhelming the user.",
  },
  {
    title: "8px Grid System",
    description:
      "All spacing, padding, margins, and sizing should follow an 8px baseline grid. Use multiples of 8 (8, 16, 24, 32, 40, 48, 64, 96px) for consistency. For fine-tuning in dense UIs, 4px increments are acceptable.",
  },
  {
    title: "WCAG AA Contrast",
    description:
      "Text must meet WCAG AA contrast ratios: 4.5:1 for body text, 3:1 for large text (18px+ bold or 24px+ regular). Interactive elements must have visible focus states. Never rely on color alone to convey information.",
  },
  {
    title: "Visual Hierarchy",
    description:
      "Establish clear hierarchy through size, weight, color, and spacing. Most important elements should be largest and boldest. Use a type scale with clear differentiation (2.25rem for h1, 1.5rem for h2, 1rem for body).",
  },
  {
    title: "Consistent Spacing Scale",
    description:
      "Define a limited set of spacing values (xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px, 2xl: 48px, 3xl: 64px). Use consistently across all components — margins, paddings, gaps, and layout offsets.",
  },
  {
    title: "Content-First Layout",
    description:
      "Design around the content, not the container. Start with the narrative or data the user needs, then build the layout to serve it. Every element should have a purpose — remove anything that doesn't serve the user's goal.",
  },
  {
    title: "Progressive Disclosure",
    description:
      "Reveal complexity gradually. Show essential actions upfront; tuck secondary options behind expansions, modals, or settings. Reduces cognitive load and prevents decision paralysis.",
  },
  {
    title: "Touch-Friendly Targets",
    description:
      "Interactive elements must be at least 44x44px for touch targets (following Apple HIG and Material Design guidelines). Provide adequate spacing between clickable elements to prevent mis-taps.",
  },
  {
    title: "Consistent Component Language",
    description:
      "Use the same component for the same purpose throughout the interface. Define a shared set of button styles, input variants, cards, and modals. Don't introduce new patterns when existing ones work.",
  },
  {
    title: "Loading & Empty States",
    description:
      "Never show a blank screen. Every view needs a loading state (skeleton or spinner), an empty state (helpful illustration + CTA), and an error state (message + retry). Design for all states, not just the ideal one.",
  },
]
