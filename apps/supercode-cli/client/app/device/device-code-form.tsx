"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ShieldAlert } from "lucide-react"
import { authClient } from "@/lib/auth-client"

const DeviceCodeForm = () => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [userCode, setUserCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const codeFromUrl = searchParams.get("user_code")
    if (codeFromUrl) {
      const formatted = formatCode(codeFromUrl.toUpperCase().replace(/[^A-Z0-9]/g, ""))
      setUserCode(formatted)
    }
  }, [searchParams])

  const formatCode = (raw: string) => {
    if (raw.length > 4) {
      return raw.slice(0, 4) + "-" + raw.slice(4, 8)
    }
    return raw
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
    value = formatCode(value)
    setUserCode(value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const formattedCode = userCode.trim().replace(/-/g, "").toUpperCase()
      const response = await authClient.device({
        query: { user_code: formattedCode },
      })

      if (response.data) {
        router.push(`/approve?user_code=${formattedCode}`)
      } else if (response.error) {
        const msg =
          (response.error as { error_description?: string }).error_description ||
          (response.error as { error?: string }).error ||
          "Verification failed"
        setError(msg)
      }
    } catch {
      setError("Invalid or expired code")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="p-3 rounded-lg border-2 border-dashed border-zinc-700">
            <ShieldAlert className="w-8 h-8 text-yellow-300" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Device Authorization
            </h1>
            <p className="text-muted-foreground">
              Enter your device code to continue
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-2 border-dashed border-zinc-700 rounded-xl p-8 bg-zinc-950 backdrop-blur-sm"
        >
          <div className="space-y-6">
            <div>
              <label
                htmlFor="code"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Device Code
              </label>
              <input
                id="code"
                type="text"
                value={userCode}
                onChange={handleCodeChange}
                placeholder="XXXX-XXXX"
                maxLength={9}
                className="w-full px-4 py-3 bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-zinc-600 font-mono text-center text-lg tracking-widest"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Find this code on the device you want to authorize
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-950 border border-red-900 text-red-200 text-sm mt-4">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || userCode.length < 9}
              className="w-full py-3 px-4 bg-zinc-100 text-zinc-950 font-semibold rounded-lg hover:bg-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? "Verifying..." : "Continue"}
            </button>

            <div className="p-4 bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-lg">
              <p className="text-xs text-muted-foreground leading-relaxed">
                This code is unique to your device and will expire shortly.
                Keep it confidential and never share it with anyone.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default DeviceCodeForm
