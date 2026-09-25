import { createAuthClient } from "better-auth/react";

// Auth is mounted at /api/auth in each Next.js app. Let Better Auth use the
// browser's current origin so local, preview, and production deployments do
// not depend on a separately configured public URL.
export const { signIn, signUp, useSession, signOut } = createAuthClient();
