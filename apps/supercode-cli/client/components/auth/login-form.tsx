'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '../ui/card'
import { authClient } from '@/lib/auth-client'
import { Spinner } from '@/components/ui/spinner'
import { Github, Code2, Sparkles, ArrowRight } from 'lucide-react'
import { ParticleBackground } from './particle-background'
import { PixelLogo } from '@/components/ui/pixel-logo'

const LoginForm = () => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  const { data, isPending } = authClient.useSession()

  useEffect(() => {
    if (!isPending && data?.session) {
      router.push("/")
    }
  }, [data, isPending, router])

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950">
        <Spinner className="size-8 text-amber-500" />
      </div>
    )
  }

  if (data?.session) {
    return null
  }

  const handleGitHubSignIn = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams(window.location.search)
      const redirect = params.get("redirect") || ""
      const callbackURL = redirect
        ? new URL(redirect, window.location.origin).toString()
        : window.location.origin
      await authClient.signIn.social({
        provider: 'github',
        callbackURL,
        errorCallbackURL: `${window.location.origin}/sign-in`,
      })
    } catch (err) {
      console.error('Sign in error:', err)
      setError('Failed to connect to authentication server. Make sure the terminal server is running.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4">
      <ParticleBackground />
      
      <div 
        className={`
          relative z-10 w-full max-w-md
          transition-all duration-700 ease-out
          ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
        `}
      >
        <div className="flex flex-col items-center space-y-8 w-full">
          <div 
            className={`
              flex flex-col items-center gap-3 w-full
              transition-all duration-700 delay-100 ease-out
              ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}
            `}
          >
            <a href="/" className="group flex justify-center w-full pl-15">
              <PixelLogo />
            </a>
            <p className="text-zinc-400 text-sm md:text-base max-w-sm leading-relaxed text-center">
              AI-powered coding assistant. Build faster with intelligent automation.
            </p>
          </div>

          <div 
            className={`
              w-full
              transition-all duration-700 delay-300 ease-out
              ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
            `}
          >
            <Card className="bg-zinc-900/60 backdrop-blur-xl border-zinc-800/50 shadow-2xl shadow-orange-500/5 w-full">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={handleGitHubSignIn}
                    disabled={isLoading}
                    className="
                      w-full h-12 rounded-lg font-mono text-sm font-medium
                      bg-zinc-800/50 text-zinc-100
                      border border-zinc-700/50
                      hover:bg-zinc-700/50 hover:text-white hover:border-zinc-600/50
                      active:bg-zinc-700/70
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-all duration-[160ms] ease-out
                      active:scale-[0.98]
                      flex items-center justify-center gap-3
                      group
                    "
                  >
                    {isLoading ? (
                      <div className="size-5 border-2 border-zinc-500 border-t-zinc-100 rounded-full animate-spin" />
                    ) : (
                      <>
                        <Github className="size-5 transition-transform duration-200 group-hover:scale-110" />
                        <span>Continue with GitHub</span>
                        <span className="ml-auto opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}>
                          <ArrowRight className="size-4" />
                        </span>
                      </>
                    )}
                  </button>

                  {error && (
                    <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3">
                      <p className="text-xs text-red-400 leading-relaxed">{error}</p>
                    </div>
                  )}

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-zinc-800" />
                    </div>
                    <div className="relative flex justify-center text-xs font-mono">
                      <span className="px-2 bg-zinc-900 text-zinc-600">or</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs text-zinc-600 font-mono">
                    <Code2 className="size-3" />
                    <span>start coding in seconds</span>
                    <Sparkles className="size-3 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div 
            className={`
              text-center
              transition-all duration-700 delay-500 ease-out
              ${isVisible ? 'opacity-100' : 'opacity-0'}
            `}
          >
            <p className="text-[11px] text-zinc-700 font-mono">
              By continuing, you agree to our{' '}
              <a href="#" className="text-zinc-500 hover:text-amber-400 transition-colors duration-200">
                terms
              </a>{' '}
              and{' '}
              <a href="#" className="text-zinc-500 hover:text-amber-400 transition-colors duration-200">
                privacy policy
              </a>
            </p>
          </div>
        </div>
      </div>

      <div 
        className={`
          absolute bottom-4 left-1/2 -translate-x-1/2
          transition-all duration-700 delay-700 ease-out
          ${isVisible ? 'opacity-100' : 'opacity-0'}
        `}
      >
        <div className="flex items-center gap-2 text-[11px] text-zinc-700 font-mono">
          <span className="size-1.5 rounded-full bg-emerald-500/60" />
          <span>server online</span>
        </div>
      </div>
    </div>
  )
}

export default LoginForm
