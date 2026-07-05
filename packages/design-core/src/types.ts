export type ArtifactType =
  | "PROTOTYPE"
  | "DASHBOARD"
  | "DECK"
  | "IMAGE"
  | "HYPERFRAME"

export interface DesignSkill {
  id: string
  name: string
  description: string
  instructions: string
  artifactType: ArtifactType
}

export interface DesignSystemColor {
  hex: string
  rgb: string
  usage: string
}

export interface DesignSystemTypography {
  family: string
  headingFont?: string
  bodyFont: string
  monoFont?: string
  scale: Record<string, string>
}

export interface DesignSystemSpacing {
  unit: number
  scale: string[]
}

export interface DesignSystem {
  id: string
  name: string
  description: string
  colors: DesignSystemColor[]
  typography: DesignSystemTypography
  spacing: DesignSystemSpacing
  borderRadius: string
  shadow: string
  motion?: string
  voice?: string
}

export interface DesignPrinciple {
  title: string
  description: string
}

export interface GenerateRequest {
  skillId: string
  designSystemId: string
  prompt: string
  model?: string
}

export interface ArtifactRecord {
  id: string
  projectId: string
  type: ArtifactType
  title?: string
  prompt?: string
  content?: unknown
  files?: unknown
  createdAt: string
}

export type Framework = "html" | "nextjs" | "react" | "nuxt" | "vue" | "svelte"

export interface FrameworkConfig {
  id: Framework
  name: string
  extension: string
  entryFile: string
  promptInstruction: string
}

export const FRAMEWORKS: FrameworkConfig[] = [
  {
    id: "html",
    name: "Self-contained HTML",
    extension: "html",
    entryFile: "index.html",
    promptInstruction:
      "Generate a single self-contained HTML file with embedded CSS in a <style> tag. All CSS, JS, and assets must be inline — no external dependencies except Google Fonts if specified.",
  },
  {
    id: "nextjs",
    name: "Next.js (App Router)",
    extension: "tsx",
    entryFile: "app/page.tsx",
    promptInstruction:
      "Generate React / Next.js App Router components using TypeScript and Tailwind CSS. Each component should be a separate file. Import layout components (Header, Footer, etc.) from '@/components/'. Use 'use client' only when needed. Export page components as default. Include a tailwind.config.ts compatible config if custom tokens are needed.",
  },
  {
    id: "react",
    name: "React (Vite / CRA)",
    extension: "tsx",
    entryFile: "src/App.tsx",
    promptInstruction:
      "Generate React components using TypeScript. Each component should be a separate file. Export components as default. Use CSS modules or inline styles for styling. No external dependencies beyond React.",
  },
  {
    id: "nuxt",
    name: "Nuxt 3 (Vue)",
    extension: "vue",
    entryFile: "app.vue",
    promptInstruction:
      "Generate Vue 3 / Nuxt 3 components using Composition API (<script setup lang=\"ts\">) and single-file components (.vue). Each component is a separate file. Use Tailwind CSS for styling. Export page components as default. Include a nuxt.config.ts if custom config is needed.",
  },
  {
    id: "vue",
    name: "Vue 3 (standalone)",
    extension: "vue",
    entryFile: "src/App.vue",
    promptInstruction:
      "Generate Vue 3 components using Composition API (<script setup lang=\"ts\">) and single-file components (.vue). Each component is a separate file. Use scoped styles within <style scoped>. No external dependencies beyond Vue.",
  },
  {
    id: "svelte",
    name: "Svelte 5",
    extension: "svelte",
    entryFile: "src/App.svelte",
    promptInstruction:
      "Generate Svelte 5 components using runes ($state, $derived, $effect). Each component is a separate .svelte file. Use scoped <style> within each component. No external dependencies beyond Svelte.",
  },
]
