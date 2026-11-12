import { NextResponse } from "next/server"
import { routineFailure, routineUser } from "@/modules/nova/routines/http"
import { listRoutines, saveRoutine } from "@/modules/nova/routines/service"
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { try { return NextResponse.json({ routines: await listRoutines(await routineUser(), (await context.params).id) }) } catch (error) { return routineFailure(error) } }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { try { return NextResponse.json({ routine: await saveRoutine(await routineUser(), (await context.params).id, await request.json()) }, { status: 201 }) } catch (error) { return routineFailure(error) } }
