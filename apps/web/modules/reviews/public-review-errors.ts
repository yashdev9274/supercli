export class PublicReviewError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryAfter?: number) {
    super(message)
  }
}

export function publicReviewErrorResponse(error: unknown): Response {
  const known = error instanceof PublicReviewError
  return Response.json(
    { error: known ? error.message : "Public reviews are temporarily unavailable. Please try again later." },
    {
      status: known ? error.status : 503,
      headers: {
        "Cache-Control": "no-store",
        ...known && error.retryAfter && { "Retry-After": String(error.retryAfter) },
      },
    },
  )
}
