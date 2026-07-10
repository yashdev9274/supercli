import { NextResponse } from "next/server"
import { listDesignSystems } from "@super/design-core"

export function GET() {
  return NextResponse.json(listDesignSystems())
}
