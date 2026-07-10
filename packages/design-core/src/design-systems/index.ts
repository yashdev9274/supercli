import type { DesignSystem } from "../types"
import { LINEAR_DESIGN_SYSTEM } from "./linear"
import { VERCEL_DESIGN_SYSTEM } from "./vercel"
import { STRIPE_DESIGN_SYSTEM } from "./stripe"
import { NOTION_DESIGN_SYSTEM } from "./notion"
import { APPLE_DESIGN_SYSTEM } from "./apple"
import { SHADCN_DESIGN_SYSTEM } from "./shadcn"

const DESIGN_SYSTEMS: DesignSystem[] = [
  LINEAR_DESIGN_SYSTEM,
  VERCEL_DESIGN_SYSTEM,
  STRIPE_DESIGN_SYSTEM,
  NOTION_DESIGN_SYSTEM,
  APPLE_DESIGN_SYSTEM,
  SHADCN_DESIGN_SYSTEM,
]

const SYSTEM_MAP = new Map(DESIGN_SYSTEMS.map((s) => [s.id, s]))

export function loadDesignSystem(id: string): DesignSystem | undefined {
  return SYSTEM_MAP.get(id)
}

export function listDesignSystems(): DesignSystem[] {
  return DESIGN_SYSTEMS
}
