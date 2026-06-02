#!/usr/bin/env bun
import os from "os"
import path from "path"
import chalk from "chalk"
import open from "open"
import { z } from "zod"
import { confirm, isCancel } from "@clack/prompts"
import yoctoSpinner from "yocto-spinner"
import { createAuthClient } from "better-auth/client"
import { deviceAuthorizationClient } from "better-auth/client/plugins"
import { Command } from "commander"
import { getStoredToken, isTokenExpired, storeToken } from "src/lib/token"
import type { TokenData } from "src/lib/token"
import {
  theme,
  panel,
  frame,
  gradientText,
  step,
  statusIcon,
  heading,
  bullet,
  dimmed,
  separator,
  infoBox,
  successBox,
  errorBox,
  codeBlock,
  banner,
  tag,
  hudPanel,
  ornamentalDivider,
  glow,
  progressBar,
  keyValue,
} from "../utils/tui"

const URL = "http://localhost:3004"
const CLIENT_ID = process.env.GITHUB_CLIENT_ID
export const CONFIG_DIR = path.join(os.homedir(), ".better-auth")
export const TOKEN_FILE = path.join(CONFIG_DIR, "token.json")

type AuthError = Record<string, unknown> | null | undefined

type DeviceAuthClient = ReturnType<typeof createAuthClient> & {
  device: {
    code: (params: {
      client_id: string
      scope?: string
    }) => Promise<{
      data?: {
        device_code: string
        user_code: string
        verification_uri: string
        verification_uri_complete: string
        expires_in: number
        interval: number
      }
      error?: { error: string; error_description?: string }
    }>
    token: (params: {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      device_code: string
      client_id: string
      fetchOptions?: { headers?: Record<string, string> }
    }) => Promise<{
      data?: {
        access_token: string
        token_type?: string
        expires_in?: number
        scope?: string
      }
      error?: { error: string; error_description?: string }
    }>
  }
}

export async function loginAction(opts: Record<string, unknown>) {
  const schema = z.object({
    serverUrl: z.string().optional(),
    clientId: z.string().optional(),
  })

  const options = schema.parse(opts)

  const serverUrl = options.serverUrl || URL
  const clientId = options.clientId || CLIENT_ID || ""

  console.clear()
  console.log()
  console.log(`  ${banner("LOGIN")}`)
  console.log()

  // ── Existing session check ──────────────────────────────────────
  const existingToken = await getStoredToken()
  const expired = await isTokenExpired()

  if (existingToken && !expired) {
    const shouldRelogin = await confirm({
      message: "Already authenticated. Log in again?",
      initialValue: false,
    })

    if (isCancel(shouldRelogin) || !shouldRelogin) {
      console.log()
      console.log(
        infoBox(
          `${statusIcon("info")} Login cancelled. Existing session preserved.`,
        ),
      )
      console.log()
      process.exit(0)
    }
  }

  console.log()
  console.log(ornamentalDivider())
  console.log()

  // ── Step 1: Request authorization ──────────────────────────────
  console.log(step(1, "Requesting device authorization...", "active"))
  console.log()

  const authClient = createAuthClient({
    baseURL: serverUrl,
    plugins: [deviceAuthorizationClient()],
  }) as DeviceAuthClient

  const spinner = yoctoSpinner({
    text: chalk.hex(theme.muted)("Contacting authentication server..."),
    color: "cyan",
  })

  spinner.start()

  try {
    const { data, error } = await authClient.device.code({
      client_id: clientId,
      scope: "openid profile email",
    })

    spinner.stop()

    if (error || !data) {
      const err = error as AuthError
      const msg =
        (err?.error_description as string) ||
        (err?.statusText as string) ||
        JSON.stringify(err)
      console.log()
      console.log(errorBox(`Authorization request failed: ${msg}`))
      console.log()
      process.exit(1)
    }

    const {
      user_code,
      verification_uri_complete,
      verification_uri,
      interval = 5,
      expires_in,
    } = data

    console.log(step(1, "Device authorization requested", "done"))
    console.log()

    // ── Step 2: Open verification page ───────────────────────────
    console.log(step(2, "Open the verification page", "active"))
    console.log()

    console.log(
      frame(
        [
          `  ${glow("◆", theme.amber)} ${chalk.hex(theme.amber).bold("DEVICE AUTHORIZATION")}`,
          "",
          `  ${chalk.hex(theme.muted)("Open this URL in your browser:")}`,
          `  ${chalk.hex(theme.cyan).underline(verification_uri_complete || verification_uri)}`,
          "",
          `  ${chalk.hex(theme.dim)("╭──────────────────────────────────────╮")}`,
          `  ${chalk.hex(theme.dim)("│")}         ${chalk.hex(theme.amber).bold("VERIFICATION CODE")}        ${chalk.hex(theme.dim)("│")}`,
          `  ${chalk.hex(theme.dim)("│")}                                       ${chalk.hex(theme.dim)("│")}`,
          `  ${chalk.hex(theme.dim)("│")}     ${chalk.hex(theme.glowCyan).bold(` ${user_code.split("").join(" ")} `)}     ${chalk.hex(theme.dim)("│")}`,
          `  ${chalk.hex(theme.dim)("│")}                                       ${chalk.hex(theme.dim)("│")}`,
          `  ${chalk.hex(theme.dim)("╰──────────────────────────────────────╯")}`,
          "",
          `  ${dimmed(`Code expires in ${Math.floor(expires_in / 60)} minutes`)}`,
          `  ${dimmed(`Polling every ${interval} seconds`)}`,
        ].join("\n"),
        { title: "device authorization", borderColor: theme.dim, padding: 1 },
      ),
    )

    console.log()

    const shouldOpen = await confirm({
      message: "Open browser automatically?",
      initialValue: true,
    })

    if (!isCancel(shouldOpen) && shouldOpen) {
      const urlToOpen = verification_uri_complete || verification_uri
      await open(urlToOpen)
      console.log()
      console.log(`  ${statusIcon("info")} ${chalk.hex(theme.muted)("Browser opened — complete authorization there")}`)
    }

    console.log()
    console.log(step(2, "Verification page ready", "done"))
    console.log()

    // ── Step 3: Poll for token ───────────────────────────────────
    console.log(step(3, "Waiting for authorization...", "active"))
    console.log()

    const token = await pollForToken(authClient, data.device_code, clientId, interval)

    console.log(step(3, "Authorization received", "done"))
    console.log()

    if (token) {
      const saved = await storeToken(token as TokenData)

      console.log(ornamentalDivider())
      console.log()

      // ── Success celebration ────────────────────────────────────
      console.log(
        frame(
          [
            `  ${chalk.hex(theme.green).bold("◆  AUTHENTICATION SUCCESSFUL")}`,
            "",
            ...(saved
              ? [
                  `  ${chalk.hex(theme.muted)("Token securely stored at:")}`,
                  `  ${chalk.hex(theme.dim)(TOKEN_FILE)}`,
                ]
              : [
                  `  ${statusIcon("warning")} ${chalk.hex(theme.warning)("Warning:")} ${chalk.hex(theme.muted)("Could not save token to disk.")}`,
                  `  ${dimmed("You may need to log in again on next use.")}`,
                ]),
            "",
            `  ${chalk.hex(theme.green)("▸")} ${chalk.hex(theme.text).bold("You are now authenticated.")}`,
            `  ${chalk.hex(theme.green)("▸")} ${chalk.hex(theme.muted)("Run")} ${chalk.hex(theme.cyan)("supercode")} ${chalk.hex(theme.muted)("commands without re-authenticating.")}`,
          ].join("\n"),
          { title: "authenticated", borderColor: theme.green, padding: 0 },
        ),
      )
      console.log()
    }
  } catch (err: unknown) {
    spinner.stop()
    const message = err instanceof Error ? err.message : "Unknown error"
    console.log()
    console.log(errorBox(`Login failed: ${message}`))
    console.log()
    process.exit(1)
  }
}

async function pollForToken(
  authClient: DeviceAuthClient,
  deviceCode: string,
  clientId: string,
  initialInterval: number,
): Promise<unknown> {
  let pollingInterval = initialInterval
  let attempt = 0

  const messages = [
    "Waiting for authorization",
    "Still waiting for authorization",
    "Authorization should arrive any moment",
    "Hang tight, processing authorization",
    "Almost there, confirming with server",
  ]

  const spinner = yoctoSpinner({
    text: chalk.hex(theme.muted)(`${messages[0]}...`),
    color: "cyan",
  })

  return new Promise((resolve, reject) => {
    const poll = async () => {
      attempt++
      const dotCount = ((attempt - 1) % 4) + 1
      const msgIndex = Math.min(Math.floor(attempt / 3), messages.length - 1)

      spinner.text = chalk.hex(theme.muted)(
        `${messages[msgIndex]}${".".repeat(dotCount)}${" ".repeat(4 - dotCount)} ${chalk.hex(theme.dim)(`[poll #${attempt}]`)}`,
      )
      if (!spinner.isSpinning) spinner.start()

      try {
        const { data, error } = await authClient.device.token({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: clientId,
          fetchOptions: {
            headers: {
              "user-agent": "Supercode CLI",
            },
          },
        })

        if (data?.access_token) {
          spinner.stop()
          resolve(data)
          return
        }

        if (error) {
          switch (error.error) {
            case "authorization_pending":
              break
            case "slow_down":
              pollingInterval += 5
              spinner.text = chalk.hex(theme.warning)(
                `Slowing down — server busy. Next poll in ${pollingInterval}s`,
              )
              break
            case "access_denied":
              spinner.stop()
              console.log()
              console.log(errorBox("Authorization was denied by the user."))
              console.log()
              process.exit(1)
            case "expired_token":
              spinner.stop()
              console.log()
              console.log(errorBox("Device code expired. Please run login again."))
              console.log()
              process.exit(1)
            default:
              spinner.stop()
              console.log()
              console.log(
                errorBox(`Authorization error: ${error.error_description || error.error}`),
              )
              console.log()
              process.exit(1)
          }
        }
      } catch (error) {
        spinner.stop()
        console.log()
        console.log(
          errorBox(`Network error: ${(error as Error).message}`),
        )
        console.log()
        process.exit(1)
      }

      setTimeout(poll, pollingInterval * 1000)
    }

    setTimeout(poll, pollingInterval * 1000)
  })
}

export const loginCommand = new Command("login")
  .description("Authenticate with the Supercode server")
  .option("--server-url <url>", "The URL of the Supercode server", URL)
  .option("--client-id <id>", "The client ID of the Supercode server", CLIENT_ID)
  .action(async () => {
    await loginAction({})
  })
