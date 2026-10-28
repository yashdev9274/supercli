import type { HarnessProvider, NovaModelEntry } from "./models"

export type BrandLogo = {
  src: string
  monochrome: boolean
}

// Model-company SVG marks: LobeHub Icons (MIT), license in public/logos/models/LICENSE.
// Gateway marks: official Concentrate/Merge sites; Supercode/OrcaRouter reuse app assets.
function mark(name: string): BrandLogo {
  return { src: `/logos/models/${name}.svg`, monochrome: true }
}

export const PROVIDER_LOGOS: Record<HarnessProvider, BrandLogo> = {
  codex: mark("openai"),
  supercode: { src: "/supercode-logo.png", monochrome: false },
  concentrateai: mark("concentrateai"),
  neon: mark("neon"),
  mergedev: { src: "/logos/models/mergedev.png", monochrome: false },
  google: mark("gemini"),
  minimax: mark("minimax"),
  nvidia: mark("nvidia"),
  openrouter: mark("openrouter"),
  orcarouter: { src: "/orcarouter-logo.jpg", monochrome: false },
}

const MODEL_BRANDS: Array<[RegExp, BrandLogo]> = [
  [/claude|anthropic/i, mark("anthropic")],
  [/gpt|openai|\bo[34]-mini/i, mark("openai")],
  [/gemini|learnlm/i, mark("gemini")],
  [/deepseek/i, mark("deepseek")],
  [/kimi|moonshot/i, mark("kimi")],
  [/minimax/i, mark("minimax")],
  [/glm|z-ai/i, mark("zai")],
  [/grok|x-ai|xai\//i, mark("xai")],
  [/nemotron/i, mark("nvidia")],
  [/llama|meta\//i, mark("meta")],
  [/mistral|codestral/i, mark("mistral")],
  [/qwen|qwq/i, mark("qwen")],
  [/cohere|command r/i, mark("cohere")],
  [/mimo/i, mark("xiaomimimo")],
  [/hunyuan|\bhy3\b/i, mark("tencent")],
]

export function modelLogo(entry: NovaModelEntry): BrandLogo {
  const name = `${entry.id} ${entry.label}`
  // Unknown/stealth makers retain the serving provider's actual logo.
  return MODEL_BRANDS.find(([pattern]) => pattern.test(name))?.[1] ?? PROVIDER_LOGOS[entry.provider]
}
