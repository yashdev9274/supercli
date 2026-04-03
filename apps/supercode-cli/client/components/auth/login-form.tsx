'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { authClient } from '@/lib/auth-client'
import { Github, Code2, Sparkles, ArrowRight } from 'lucide-react'
import { ParticleBackground } from './particle-background'

const PixelLogo = ({ animate = false }: { animate?: boolean }) => {
  const colors = {
    light: '#fdba74',
    medium: '#fb923c', 
    dark: '#f97316',
  }

  return (
    <svg 
      width="400" 
      height="35" 
      viewBox="0 0 140 18" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={animate ? 'animate-float' : ''}
    >
      <g className="pixel-letter">
        <rect x="0" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="3" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="6" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="0" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="0" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="3" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="6" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="6" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="0" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="3" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="6" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="12" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="18" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="12" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="18" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="12" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="18" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="12" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="18" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="12" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="15" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="18" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="24" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="27" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="30" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="24" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="30" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="24" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="27" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="30" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="24" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="24" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="36" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="39" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="42" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="36" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="36" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="39" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="36" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="36" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="39" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="42" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="48" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="51" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="54" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="48" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="54" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="48" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="51" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="54" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="48" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="51" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="48" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="54" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="62" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="65" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="68" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="62" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="62" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="62" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="62" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="65" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="68" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="74" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="77" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="80" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="74" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="80" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="74" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="80" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="74" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="80" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="74" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="77" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="80" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="86" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="89" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="86" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="92" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="86" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="92" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="86" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="92" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="86" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="89" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="98" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="101" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="104" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="98" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="98" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="101" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="98" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="98" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="101" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="104" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
    </svg>
  )
}

const LoginForm = () => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const handleGitHubSignIn = async () => {
    setIsLoading(true)
    try {
      await authClient.signIn.social({
        provider: 'github',
        callbackURL: 'http://localhost:3000',
      })
    } catch (error) {
      console.error('Sign in error:', error)
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
              <PixelLogo animate={false} />
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
                  <Button
                    variant="outline"
                    className="
                      w-full h-12 
                      bg-zinc-800/50 hover:bg-zinc-700/50 
                      border-zinc-700/50 hover:border-zinc-600/50
                      text-zinc-100 hover:text-white
                      transition-all duration-300
                      hover:shadow-lg hover:shadow-orange-500/10
                      hover:-translate-y-0.5
                      active:translate-y-0 active:scale-[0.98]
                      group
                    "
                    type="button"
                    onClick={handleGitHubSignIn}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-zinc-400 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Github className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                        <span className="ml-2 font-medium">Continue with GitHub</span>
                        <ArrowRight className="w-4 h-4 ml-auto opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                      </>
                    )}
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-zinc-800" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2 bg-zinc-900 text-zinc-500">or</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                    <Code2 className="w-3 h-3" />
                    <span>Start coding in seconds</span>
                    <Sparkles className="w-3 h-3 text-orange-400" />
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
            <p className="text-xs text-zinc-600">
              By continuing, you agree to our{' '}
              <a href="#" className="text-zinc-400 hover:text-orange-400 transition-colors underline underline-offset-2">
                Terms
              </a>{' '}
              and{' '}
              <a href="#" className="text-zinc-400 hover:text-orange-400 transition-colors underline underline-offset-2">
                Privacy Policy
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
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span>Server online</span>
        </div>
      </div>
    </div>
  )
}

export default LoginForm
