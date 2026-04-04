import type { Metadata } from "next";
import LoginForm from '@/components/auth/login-form'
import React from 'react'

export const metadata: Metadata = {
  title: "Sign In - Supercode",
  description: "Sign in to your Supercode account and start building with AI-powered coding assistance.",
}

const Page = () => {
  return (
    <>
      <LoginForm />
    </>
  )
}

export default Page
