import { NextResponse } from "next/server"
import { listSkills } from "@super/design-core"

export function GET() {
  return NextResponse.json(listSkills())
}
