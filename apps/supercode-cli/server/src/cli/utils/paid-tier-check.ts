import chalk from "chalk"
import { theme, frame, createThinking } from "./tui"
import { select, isCancel } from "@clack/prompts"
import { getStoredToken } from "src/lib/token"

const BASE_URL = process.env.SUPERCODE_SERVER_URL || "https://supercode-8w7e.onrender.com"

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken()
  if (!token?.access_token) return {}
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token.access_token as string}`,
  }
}

export async function checkPaidTierInterest(): Promise<void> {
  const token = await getStoredToken()
  if (!token?.access_token) return

  const thinking = createThinking("paid tier")
  try {
    const res = await fetch(`${BASE_URL}/api/user/paid-tier-interest`, {
      headers: await getAuthHeaders(),
      signal: AbortSignal.timeout(5000),
    })

    // Server doesn't have the routes yet (not deployed) — skip silently
    if (res.status === 404) {
      thinking.stop()
      return
    }

    if (res.ok) {
      const data = await res.json() as { answered: boolean; interested: boolean | null }
      if (data.answered) {
        thinking.succeed()
        return
      }
    }

    thinking.stop()
    const feat = (name: string, desc: string) => {
      const padded = name.length >= 21 ? name + " " : name + " ".repeat(21 - name.length)
      return `${chalk.hex(theme.greenGlow)("◆")}  ${chalk.hex(theme.green)(chalk.bold(padded))}${chalk.hex(theme.greenDim)("— " + desc)}`
    }

    console.log()
    console.log(
      frame(
        [
          `${chalk.hex(theme.green).bold("Supercode Pro")}`,
          "",
          `${chalk.hex(theme.greenDim)("We're building premium features and want to know")}`,
          `${chalk.hex(theme.greenDim)("if you'd be interested.")}`,
          "",
          feat("Priority agent mode",  "faster, longer context, smarter routing"),
          feat("Higher usage limits",  "frontier models, more usage, larger scans"),
          feat("Better memory",        "persistent context across sessions"),
          feat("Team workspaces",      "collaborate with your team in real-time"),
          feat("Priority support",     "direct help when you need it"),
          "",
          `${chalk.hex(theme.muted)("This helps us understand demand — takes 2 seconds.")}`,
        ].join("\n"),
        { title: "coming soon", borderColor: theme.amber },
      ),
    )
    console.log()

    let response: string | symbol
    while (true) {
      response = await select({
        message: "Would you be interested in a Supercode Pro plan?",
        options: [
          { value: "yes", label: "Yes, count me in!" },
          { value: "no", label: "No, not right now" },
        ],
      })

      if (!isCancel(response)) break
      console.log(`  ${chalk.hex(theme.amber)("◆")} ${chalk.hex(theme.greenMute)("Please select an option to continue")}`)
    }

    const interested = response === "yes"

    const submitRes = await fetch(`${BASE_URL}/api/user/paid-tier-interest`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ interested }),
      signal: AbortSignal.timeout(5000),
    })

    if (!submitRes.ok) {
      const text = await submitRes.text().catch(() => "unknown error")
      console.log(`  ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.redMute)(`Could not save response (${submitRes.status})`)}`)
      console.log()
      return
    }

    const msg = interested
      ? "Thanks for your interest! We'll keep you posted."
      : "Got it! You can change your mind anytime."
    console.log(`  ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.greenMute)(msg)}`)
    console.log()
  } catch (error) {
    thinking.fail(`paid tier check failed: ${error instanceof Error ? error.message : String(error)}`)
    console.log(`  ${chalk.hex(theme.greenMute)("Continuing...")}`)
    console.log()
  }
}
