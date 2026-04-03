'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { authClient } from '@/lib/auth-client';
import { Github } from 'lucide-react';

const PixelLogo = () => {
  return (
    <svg width="400" height="35" viewBox="0 0 140 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* s */}
      <rect x="0" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="3" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="6" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="0" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="0" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="3" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="6" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="6" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="0" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="3" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="6" y="12" width="3" height="3" fill="#52525b"/>
      
      {/* u */}
      <rect x="12" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="18" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="12" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="18" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="12" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="18" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="12" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="18" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="12" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="15" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="18" y="12" width="3" height="3" fill="#52525b"/>
      
      {/* p */}
      <rect x="24" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="27" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="30" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="24" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="30" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="24" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="27" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="30" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="24" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="24" y="12" width="3" height="3" fill="#52525b"/>
      
      {/* e */}
      <rect x="36" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="39" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="42" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="36" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="36" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="39" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="36" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="36" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="39" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="42" y="12" width="3" height="3" fill="#52525b"/>
      
      {/* r */}
      <rect x="48" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="51" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="54" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="48" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="54" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="48" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="51" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="54" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="48" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="51" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="48" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="54" y="12" width="3" height="3" fill="#52525b"/>
      
      {/* C */}
      <rect x="62" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="65" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="68" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="62" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="62" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="62" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="62" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="65" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="68" y="12" width="3" height="3" fill="#52525b"/>
      
      {/* o */}
      <rect x="74" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="77" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="80" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="74" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="80" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="74" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="80" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="74" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="80" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="74" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="77" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="80" y="12" width="3" height="3" fill="#52525b"/>
      
      {/* d */}
      <rect x="86" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="89" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="86" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="92" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="86" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="92" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="86" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="92" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="86" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="89" y="12" width="3" height="3" fill="#52525b"/>
      
      {/* e */}
      <rect x="98" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="101" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="104" y="0" width="3" height="3" fill="#a1a1aa"/>
      <rect x="98" y="3" width="3" height="3" fill="#71717a"/>
      <rect x="98" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="101" y="6" width="3" height="3" fill="#71717a"/>
      <rect x="98" y="9" width="3" height="3" fill="#52525b"/>
      <rect x="98" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="101" y="12" width="3" height="3" fill="#52525b"/>
      <rect x="104" y="12" width="3" height="3" fill="#52525b"/>
    </svg>
  );
};

const LoginForm = () => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  return (
    <div className="flex flex-col gap-6 justify-center items-center">
      <div className="flex flex-col items-center justify-center space-y-4">
      <a href="/" className="flex items-center">
          <PixelLogo />
        </a>
        <h1 className="text-primary text-6xl font-extrabold text-indigo-400">
          Welcome to supercode
        </h1>
        <p className="text-base font-medium text-zinc-400">
          Login to your account and start building with supercode
        </p>
      </div>

      <Card className="border-dashed border-2">
        <CardContent>
          <div className="grid gap-6">
            <div className="flex flex-col gap-4">
              <Button
                variant="outline"
                className="w-full h-full"
                type="button"
                onClick={() => {
                  authClient.signIn.social({
                    provider: 'github',
                    callbackURL: 'http://localhost:3000',
                  })
                }}
              >
                <Github className="size-4" />
                <span className="ml-2">Continue With GitHub</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default LoginForm
