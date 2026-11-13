import { NextResponse } from "next/server"
import { routineFailure, routineUser } from "@/modules/nova/routines/http"
import { deleteRoutine, saveRoutine } from "@/modules/nova/routines/service"
export async function PATCH(request: Request, context: { params: Promise<{ id: string; routineId: string }> }) { try { const p = await context.params; return NextResponse.json({ routine: await saveRoutine(await routineUser(), p.id, await request.json(), p.routineId) }) } catch (error) { return routineFailure(error) } }
export async function DELETE(_request: Request, context: { params: Promise<{ id: string; routineId: string }> }) { try { const p = await context.params; await deleteRoutine(await routineUser(), p.id, p.routineId); return new NextResponse(null, { status: 204 }) } catch (error) { return routineFailure(error) } }
