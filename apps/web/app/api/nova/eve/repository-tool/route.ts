import { repositoryToolRequest } from "@/modules/nova/eve/repository"
import { eveHttpError } from "@/modules/nova/eve/http"

export const runtime = "nodejs"
export const maxDuration = 360

export async function POST(request: Request) {
  try { return Response.json(await repositoryToolRequest(request), { headers: { "Cache-Control": "no-store" } }) }
  catch (error) { return eveHttpError(error) }
}
