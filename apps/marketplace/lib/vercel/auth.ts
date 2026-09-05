import { createRemoteJWKSet, jwtVerify } from "jose"
import { JWTExpired, JWTInvalid } from "jose/errors"
import { type NextRequest, NextResponse } from "next/server"

import { env } from "../env"

const JWKS = createRemoteJWKSet(
  new URL("https://marketplace.vercel.com/.well-known/jwks"),
)

export type OidcClaims = {
  sub: string
  aud: string
  iss: string
  exp: number
  iat: number
  account_id: string
  installation_id: string
  user_id?: string
  user_role?: "ADMIN" | "USER"
  user_name?: string
  user_email?: string
  user_avatar_url?: string
  type?: string
}

/** Next.js 16 App Router route context — params is always a Promise. */
export type AppRouteHandlerContext = {
  params: Promise<Record<string, string>>
}

export function withAuth(
  callback: (
    claims: OidcClaims,
    req: NextRequest,
    context: AppRouteHandlerContext,
  ) => Promise<Response>,
): (req: NextRequest, context: AppRouteHandlerContext) => Promise<Response> {
  return async (req, context) => {
    try {
      const token = getAuthorizationToken(req)
      const claims = await verifyToken(token)
      return await callback(claims, req, context)
    } catch (err) {
      if (err instanceof AuthError) {
        return new NextResponse(err.message, { status: 403 })
      }
      console.error("[marketplace] auth error", err)
      return new NextResponse("Internal auth error", { status: 500 })
    }
  }
}

export async function verifyToken(token: string): Promise<OidcClaims> {
  try {
    const { payload } = await jwtVerify(token, JWKS)

    const claims = payload as unknown as OidcClaims

    if (claims.aud !== env.INTEGRATION_CLIENT_ID) {
      throw new AuthError("Invalid audience")
    }

    if (claims.iss !== "https://marketplace.vercel.com") {
      throw new AuthError("Invalid issuer")
    }

    return claims
  } catch (err) {
    if (err instanceof AuthError) throw err
    if (err instanceof JWTExpired) throw new AuthError("Auth expired")
    if (err instanceof JWTInvalid) throw new AuthError("Auth invalid")
    throw err
  }
}

function getAuthorizationToken(req: Request): string {
  const authHeader = req.headers.get("Authorization")
  const match = authHeader?.match(/^bearer (.+)$/i)
  if (!match) {
    throw new AuthError("Invalid Authorization header")
  }
  return match[1]!
}

class AuthError extends Error {}
