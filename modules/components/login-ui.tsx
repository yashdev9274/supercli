"use client"

import { signIn } from '@/lib/auth-client'
import { motion } from "framer-motion";

import React, { useState } from 'react'
import { Github, Gitlab, Terminal, Moon, ChevronDown, Rocket } from "lucide-react";
import Link from 'next/link';


interface AuthButtonProps {
    name?: string;
    icon?: React.ElementType;
    cloud?: boolean;
    delay?: number;
    onClick?: () => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }
  
  function AuthButton({ name, icon: Icon, cloud, delay = 0, onClick, disabled, children }: AuthButtonProps) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay }}
        onClick={onClick}
        disabled={disabled}
        className="w-full group relative flex items-center justify-between p-4 bg-card border border-border hover:border-primary hover:bg-accent transition-all rounded-none overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="absolute inset-y-0 left-0 w-1 bg-primary scale-y-0 group-hover:scale-y-100 transition-transform origin-top" />
        <div className="flex items-center gap-4">
          {Icon && <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />}
          {children || (name && (
            <span className="text-sm tracking-widest text-foreground group-hover:text-primary transition-colors uppercase font-bold">
              {name}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {cloud && (
            <span className="text-[10px] font-bold text-primary/70 uppercase tracking-tighter">Cloud</span>
          )}
          {cloud && <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </div>
      </motion.button>
    );
  }

const LoginUI=()=> {


    const providers = [
        { name: "GitHub", icon: Github, cloud: true },
        { name: "GitLab", icon: Gitlab, cloud: true },
        { name: "AzureDevOps", icon: Terminal, cloud: false },
        { name: "Bitbucket", icon: Terminal, cloud: false },
      ];

    const [isLoading, setIsLoading] = useState(false)
    const handleGithubLogin = async ()=>{
        setIsLoading(true)
        try {
            await signIn.social({
                provider:"github",
                callbackURL: "/dashboard"
            })
        } catch (error) {
            console.error("Login error:", error)
        }
        setIsLoading(false)
    }
    
  return (
    <div className="min-h-screen bg-background text-foreground font-mono selection:bg-primary/30 selection:text-primary overflow-hidden relative">
      {/* Background patterns */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      <nav className="relative z-10 flex justify-between items-center px-8 py-6 border-b border-border bg-background/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-none">
            <Rocket className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tighter text-foreground uppercase">SuperCLI</span>
        </div>
        <button className="p-2 hover:bg-accent rounded-none transition-colors border border-border">
          <Moon className="w-4 h-4 text-muted-foreground" />
        </button>
      </nav>

      <main className="relative z-10 container mx-auto px-8 pt-12 lg:pt-24 flex flex-col lg:flex-row items-center justify-between gap-16">
        {/* Left Side: Marketing Content */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="max-w-xl"
        >
          <h1 className="text-5xl lg:text-7xl font-bold text-foreground leading-[1.1] tracking-tighter mb-8 uppercase">
            Supercharge <br />
            Workflow in <br />
            <span className="text-primary relative inline-block">
              Half.
              <motion.div 
                className="absolute -bottom-2 left-0 w-full h-1 bg-primary/30"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.8, duration: 0.8 }}
              />
            </span>
            <br />
            Instantly.
          </h1>
          <p className="text-lg lg:text-xl text-muted-foreground max-w-md leading-relaxed">
            Empower your command line with the most advanced AI-driven CLI companion. Stop searching docs, start shipping.
          </p>
          
          <div className="mt-12 opacity-20 pointer-events-none">
            <div className="w-[1px] h-32 bg-gradient-to-b from-primary to-transparent ml-4" />
          </div>
        </motion.div>

        {/* Right Side: Login Form */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <div className="text-left mb-10 border-l-4 border-primary pl-6">
            <h2 className="text-3xl font-bold text-primary mb-2 tracking-tighter uppercase">Authentication</h2>
            <p className="text-muted-foreground text-sm">Select a provider to access SuperCLI terminal.</p>
          </div>

          <div className="space-y-0.5">
            <AuthButton 
              name={isLoading ? "Signing in..." : "GitHub"} 
              icon={Github} 
              cloud 
              delay={0.4}
              onClick={handleGithubLogin}
              disabled={isLoading}
            />
            <AuthButton name="GitLab" icon={Gitlab} cloud delay={0.5} />
            <AuthButton name="AzureDevOps" icon={Terminal} delay={0.6} />
            <AuthButton name="Bitbucket" icon={Terminal} delay={0.7} />
          </div>

          <div className="mt-8 text-left">
            <p className="text-sm text-muted-foreground">
              NEW TO SUPERCLI?{" "}
              <Link href="#" className="text-primary hover:underline underline-offset-4 font-bold">
                SIGN UP
              </Link>
            </p>
          </div>
        </motion.div>
      </main>

      <footer className="absolute bottom-8 left-0 w-full px-8 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
        <div className="flex gap-4">
          <Link href="#" className="hover:text-primary transition-colors">Terms</Link>
          <Link href="#" className="hover:text-primary transition-colors">Privacy</Link>
        </div>
        <span>&copy; 2024 SuperCLI Systems</span>
      </footer>

      {/* Subtle bottom-left background graphic */}
      <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
    </div>
  )
}

export default LoginUI