import fs from "fs/promises"
import chalk from "chalk"
import { CONFIG_DIR, TOKEN_FILE } from "../cli/commands/login"

export type TokenData = {
  access_token: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expires_in?: number
}

export async function getStoredToken(): Promise<Record<string, unknown> | null> {
  try {
    const data = await fs.readFile(TOKEN_FILE, "utf-8")
    return JSON.parse(data)
  } catch {
    return null
  }
}

export async function storeToken(token: TokenData): Promise<boolean> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true })

    const tokenData = {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_type: token.token_type || "Bearer",
      scope: token.scope,
      expires_at: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      created_at: new Date().toISOString(),
    }

    await fs.writeFile(TOKEN_FILE, JSON.stringify(tokenData, null, 2), "utf-8")
    return true
  } catch (error) {
    console.error(chalk.red("Failed to store token:"), (error as Error).message)
    return false
  }
}

export async function clearStoredToken(): Promise<boolean> {
  try {
    await fs.unlink(TOKEN_FILE)
    return true
  } catch {
    return false
  }
}

export async function isTokenExpired() {
  const token = await getStoredToken();
  if (!token || !token.expires_at) {
    return true;
  }

  const expiresAt = new Date(token.expires_at as string);
  const now = new Date();

  // Consider expired if less than 5 minutes remaining
  return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
}

export async function requireAuth() {
  const token = await getStoredToken();

  if (!token) {
    console.log(
      chalk.red("✘  Not authenticated. Please run 'your-cli login' first.")
    );
    process.exit(1);
  }

  if (await isTokenExpired()) {
    console.log(
      chalk.yellow("⚠  Your session has expired. Please login again.")
    );
    console.log(chalk.gray("   Run: your-cli login\n"));
    process.exit(1);
  }
  return token;
}
