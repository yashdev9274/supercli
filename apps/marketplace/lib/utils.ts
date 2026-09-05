import type { z } from "zod"

export async function readRequestBodyWithSchema<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<
  | { success: true; data: z.infer<T> }
  | { success: false; error: z.ZodError }
> {
  try {
    const json = await request.json()
    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      return { success: false, error: parsed.error }
    }
    return { success: true, data: parsed.data }
  } catch {
    return {
      success: false,
      error: { issues: [{ message: "Invalid JSON body" }] } as z.ZodError,
    }
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}
