#!/usr/bin/env bun
import fs from "fs"
import os from "os"
import path from "path"
import chalk from "chalk"
import open from "open"
import { z } from "zod"
import { intro, confirm, cancel, isCancel, outro } from "@clack/prompts"
import yoctoSpinner from "yocto-spinner"
import { createAuthClient } from "better-auth/client"
import { deviceAuthorizationClient } from "better-auth/client/plugins"
import { Command } from "commander"
import { logger } from "better-auth"
import { getStoredToken, isTokenExpired, storeToken } from "src/lib/token"
import type { TokenData } from "src/lib/token"

const URL = "http://localhost:3004"
const CLIENT_ID = process.env.GITHUB_CLIENT_ID 
export const CONFIG_DIR = path.join(os.homedir(), ".better-auth")
export const TOKEN_FILE = path.join(CONFIG_DIR, "token.json")


// type LoginOptions = {
//   serverUrl?: string
//   clientId?: string
//   defaultServerUrl?: string
// }

// function readStoredToken(): { token: string; expiresAt: number } | null {
//   try {
//     if (!fs.existsSync(TOKEN_FILE)) return null
//     return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"))
//   } catch {
//     return null
//   }
// }

// function writeStoredToken(data: {
//   token: string
//   expiresIn: number
// }): boolean {
//   try {
//     if (!fs.existsSync(CONFIG_DIR)) {
//       fs.mkdirSync(CONFIG_DIR, { recursive: true })
//     }
//     fs.writeFileSync(
//       TOKEN_FILE,
//       JSON.stringify({
//         token: data.token,
//         expiresAt: Date.now() + data.expiresIn * 1000,
//       }),
//       "utf-8"
//     )
//     return true
//   } catch {
//     return false
//   }
// }

export async function loginAction(opts: any) {
  const schema = z.object({
    serverUrl: z.string().optional(),
    clientId: z.string().optional(),
  })

  const options = schema.parse(opts)

  const serverUrl =
    options.serverUrl || URL;
  const clientId =
    options.clientId ||
    CLIENT_ID || ""

  intro(chalk.bold("Supercode CLI Login"))

  // const existingToken = readStoredToken()
  // const expired = existingToken
  //   ? Date.now() >= existingToken.expiresAt
  //   : true


  const existingToken = await getStoredToken();
  const expired = await isTokenExpired();

  if (existingToken && !expired) {
    const shouldRelogin = await confirm({
      message: "You are already logged in. Do you want to log in again?",
      initialValue: false,
    })

    if (isCancel(shouldRelogin) || !shouldRelogin) {
      cancel("Login cancelled.")
      process.exit(0)
    }
  }


  const authClient = createAuthClient({
    baseURL: serverUrl,
    plugins: [deviceAuthorizationClient()],
  })

  const spinner = yoctoSpinner({
    text: "Requesting device authorization...",
  })

  spinner.start()

  try {
    const { data, error } = await authClient.device.code({
      client_id: clientId,
      scope: "openid profile email",
    })

    spinner.stop()

    // if (error || !data) {
    //   const err = error as Record<string, unknown> | null | undefined
    //   const msg =
    //     (err?.error_description as string) ||
    //     (err?.statusText as string) ||
    //     JSON.stringify(err)
    //   console.error(
    //     chalk.red(`Failed to request device authorization: ${msg}`)
    //   )
    //   process.exit(1)
    // }

    if (error || !data) {
      const err = error as Record<string, unknown> | null | undefined
      const msg =
        err?.error_description ||
        err?.statusText ||
        JSON.stringify(err)
      logger.error(`Failed to request device authorization: ${msg}`)
      process.exit(1)
    }

    const {
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete,
      interval = 5,
      expires_in,
    } = data

    console.log(chalk.cyan("\nDevice Authorization Required"))
    console.log(
      `Please visit ${chalk.underline.blue(
        verification_uri_complete || verification_uri
      )}`
    )
    console.log(`Enter code: ${chalk.bold.green(user_code)}\n`)

    const shouldOpen = await confirm({
      message: "Open browser automatically?",
      initialValue: true,
    })

    if (!isCancel(shouldOpen) && shouldOpen) {
      const urlToOpen = verification_uri_complete || verification_uri
      await open(urlToOpen)
    }

    console.log(
      chalk.gray(
        `Waiting for authorization (expires in ${Math.floor(
          expires_in / 60
        )} minutes)...`
      )
    )

    const token = await pollForToken(
      authClient,
      device_code,
      clientId,
      interval,
    )

    if (token) {
      const saved = await storeToken(token as TokenData)

      if (!saved) {
        console.log(
          chalk.yellow(
            "\nWarning: Could not save authentication token to disk."
          )
        )
        console.log(
          chalk.yellow("You may need to log in again on next use.")
        )
      } else {
        console.log(
          chalk.gray(
            "\nYou can now use AI commands without logging in again."
          )
        )
      }

      // get the user's data

      outro(chalk.green("Login successful!"))
      console.log(chalk.gray(`\nToken saved to: ${TOKEN_FILE}`))

      console.log(chalk.gray("You can now use supercode without logging in again. \n"))
    }
  } catch (err: any) {
    spinner.stop()
    console.error(chalk.red("\nLogin failed:"), err.message)
    process.exit(1)
  }

}


async function pollForToken(
  authClient: any,
  deviceCode: string,
  clientId: string,
  initialInterval: number,
){
  // const deadline = Date.now() + expiresIn * 1000
  let pollingInterval = initialInterval
  let dots = 0

  const spinner = yoctoSpinner({
    text: "Waiting for authorization...",
    color: "cyan",
  })

  return new Promise((resolve, reject) => {
    // Windsurf: Refactor | Explain | Generate JSDoc | X
    const poll = async () => {
      dots = (dots + 1) % 4;
      spinner.text = chalk.gray(
        `Polling for authorization${".".repeat(dots)}${" ".repeat(3 - dots)}`
      );
      if (!spinner.isSpinning) spinner.start();
  
      try {
        const { data, error } = await authClient.device.token({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: clientId,
          fetchOptions: {
            headers: {
              "user-agent": `My CLI`,
            },
          },
        });

        if (data?.access_token) {
          console.log(
            chalk.bold.yellow(`Your access token: ${data.access_token}`)
          );
        
          spinner.stop();
          resolve(data);
          return;
        } else if (error){
          switch (error.error) {
            case "authorization_pending":
              // Continue polling
              break;
            case "slow_down":
              pollingInterval += 5;
              break;
            case "access_denied":
              console.error("Access was denied by the user");
              return;
            case "expired_token":
              console.error("The device code has expired. Please try again.");
              return;
            default:
              spinner.stop()
              logger.error(`Error: ${error.error_description}`);
              process.exit(1)
          }
        }
        
      } catch (error) {
        spinner.stop()
        logger.error(`Network Error: ${(error as Error).message}`);
        process.exit(1)
      }

      setTimeout(poll, pollingInterval * 1000);
    };
    setTimeout(poll, pollingInterval * 1000);
  });
}

//   spinner.start()

//   while (Date.now() < deadline) {
//     attempt++

//     const { data, error } = await authClient.device.token({
//       grant_type: "urn:ietf:params:oauth:grant-type:device_code",
//       device_code: deviceCode,
//       client_id: clientId,
//     })

//     if (data && !error) {
//       spinner.stop(chalk.green("Authorization granted!"))
//       return data.access_token
//     }

//     const errCode = error?.error as string | undefined

//     if (errCode === "authorization_pending") {
//       spinner.text = `Waiting for authorization (attempt ${attempt})...`
//     } else if (errCode === "slow_down") {
//       pollingInterval += 5
//       spinner.text = "Waiting for authorization (slowing down)..."
//     } else if (errCode === "expired_token") {
//       spinner.stop(chalk.red("Authorization expired."))
//       console.error(
//         chalk.red(
//           "The device code expired. Please run the login command again."
//         )
//       )
//       return null
//     } else if (errCode === "access_denied") {
//       spinner.stop(chalk.red("Authorization denied."))
//       console.error(chalk.red("You denied the authorization request."))
//       return null
//     } else if (errCode) {
//       spinner.stop(chalk.red("Error during authorization."))
//       console.error(
//         chalk.red(
//           `Unexpected error: ${error?.error_description || errCode}`
//         )
//       )
//       return null
//     }

//     await sleep(pollingInterval * 1000)
//   }

//   spinner.stop(chalk.red("Authorization timed out."))
//   console.error(
//     chalk.red(
//       "The authorization request timed out. Please run the login command again."
//     )
//   )
//   return null
// }

// function sleep(ms: number): Promise<void> {
//   return new Promise((resolve) => setTimeout(resolve, ms))
// }

// const isMain = process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]))
// if (isMain) {
//   loginAction().catch((err) => {
//     console.error(chalk.red("Login failed:"), err.message)
//     process.exit(1)
//   })
// }


// commander setup
export const loginCommand = new Command("login")
  .description("Authenticate with the Supercode server")
  .option("--server-url <url>", "The URL of the Supercode server",URL)
  .option("--client-id <id>", "The client ID of the Supercode server",CLIENT_ID)
  .action(async () => {
    await loginAction({})
})

// }


