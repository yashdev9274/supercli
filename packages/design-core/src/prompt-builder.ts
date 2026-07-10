import type { DesignSystem, DesignPrinciple, Framework } from "./types"
import { FRAMEWORKS } from "./types"
import { loadSkill } from "./skills"
import { loadDesignSystem } from "./design-systems"
import { DESIGN_PRINCIPLES } from "./principles"

export interface BuildPromptOptions {
  skillId: string
  designSystemId: string
  userPrompt: string
  framework?: Framework
  customPrinciples?: DesignPrinciple[]
}

function getFrameworkInstruction(framework: Framework): string {
  const cfg = FRAMEWORKS.find((f) => f.id === framework)
  return cfg?.promptInstruction ?? FRAMEWORKS[0].promptInstruction
}

export function buildSystemPrompt(options: BuildPromptOptions): string {
  const skill = loadSkill(options.skillId)
  const designSystem = loadDesignSystem(options.designSystemId)
  const principles = options.customPrinciples ?? DESIGN_PRINCIPLES
  const framework = options.framework ?? "html"
  const isHtml = framework === "html"

  const parts: string[] = [
    `You are a design engineer. Generate production-ready code based on the following specifications.`,
    ``,
  ]

  if (skill) {
    parts.push(`--- SKILL: ${skill.name} ---`)
    parts.push(``)
    parts.push(skill.instructions)
    parts.push(``)
  }

  if (designSystem) {
    parts.push(`--- DESIGN SYSTEM: ${designSystem.name} ---`)
    parts.push(``)
    parts.push(formatDesignSystem(designSystem))
    parts.push(``)
  }

  parts.push(`--- DESIGN PRINCIPLES ---`)
  parts.push(``)
  for (const p of principles) {
    parts.push(`## ${p.title}`)
    parts.push(p.description)
    parts.push(``)
  }

  parts.push(`--- FRAMEWORK: ${framework} ---`)
  parts.push(``)
  parts.push(getFrameworkInstruction(framework))
  parts.push(``)

  parts.push(`--- OUTPUT REQUIREMENTS ---`)
  parts.push(``)

  if (isHtml) {
    parts.push(`- Generate a single self-contained HTML file`)
    parts.push(`- All CSS must be embedded in a single <style> tag in <head>`)
    parts.push(`- No external dependencies — no CDN links except Google Fonts if specified above`)
    parts.push(`- No JavaScript frameworks or libraries unless required by the skill`)
  } else {
    parts.push(`- Generate component files for the ${framework} framework`)
    parts.push(`- Use the standard project structure conventions for ${framework}`)
    parts.push(`- Wrap each file with a marker: ---FILE: path/to/file.ext ---`)
    parts.push(`- After all files, generate a standalone preview HTML wrapped in ---PREVIEW--- tags`)
    parts.push(`- The preview HTML must be a self-contained page that shows the component in context`)
    parts.push(`- Use TypeScript where applicable, Tailwind CSS for styling`)
  }
  parts.push(`- Responsive design for mobile, tablet, and desktop`)
  parts.push(`- Semantic HTML5 elements`)
  parts.push(`- Color values must exactly match the design system above`)
  parts.push(`- Follow the 8px grid system for all spacing`)
  parts.push(`- Ensure WCAG AA contrast ratios`)

  return parts.join("\n")
}

function formatDesignSystem(ds: DesignSystem): string {
  const lines: string[] = []

  lines.push(`Brand: ${ds.name}`)
  lines.push(`Description: ${ds.description}`)
  lines.push(``)

  lines.push(`### Colors`)
  for (const c of ds.colors) {
    lines.push(`- ${c.usage}: ${c.hex} (${c.rgb})`)
  }
  lines.push(``)

  const t = ds.typography
  lines.push(`### Typography`)
  lines.push(`- Font family: ${t.family}`)
  if (t.headingFont) lines.push(`- Heading font: ${t.headingFont}`)
  if (t.bodyFont) lines.push(`- Body font: ${t.bodyFont}`)
  if (t.monoFont) lines.push(`- Mono font: ${t.monoFont}`)
  lines.push(`- Type scale:`)
  for (const [key, val] of Object.entries(t.scale)) {
    lines.push(`  - ${key}: ${val}`)
  }
  lines.push(``)

  lines.push(`### Spacing`)
  lines.push(`- Unit: ${ds.spacing.unit}px`)
  lines.push(`- Scale: ${ds.spacing.scale.join(", ")}`)
  lines.push(``)

  lines.push(`### Border Radius`)
  lines.push(`- ${ds.borderRadius}`)
  lines.push(``)

  lines.push(`### Shadows`)
  lines.push(`- ${ds.shadow}`)

  if (ds.motion) {
    lines.push(``)
    lines.push(`### Motion`)
    lines.push(`- ${ds.motion}`)
  }

  if (ds.voice) {
    lines.push(``)
    lines.push(`### Voice & Tone`)
    lines.push(`- ${ds.voice}`)
  }

  return lines.join("\n")
}
