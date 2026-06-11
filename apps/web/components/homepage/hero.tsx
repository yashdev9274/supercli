"use client";

import React, { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';

const badgeTexts = ['Computing...', 'Building...', 'Deploying...', 'Shipping...', 'Creating...'];

type InstallMethod = 'curl' | 'npm' | 'bun' | 'brew' | 'npx';

const installCommands: Record<InstallMethod, { command: string; highlight: string }> = {
  curl: { command: 'curl -fsSL https://supercli.vercel.app/install', highlight: 'supercli.vercel.app/install' },
  npm: { command: 'npm install -g supercode-cli', highlight: 'supercode-cli' },
  bun: { command: 'bun install -g supercode-cli', highlight: 'supercode-cli' },
  npx: { command: 'npx supercode-cli', highlight: 'supercode-cli' },
  brew: { command: 'brew install supercode', highlight: 'supercode' },
};

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:3001/docs/intro';

const HeroSection = () => {
  const [copied, setCopied] = useState(false);
  const [currentBadgeIndex, setCurrentBadgeIndex] = useState(0);
  const [activeMethod, setActiveMethod] = useState<InstallMethod>('curl');

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBadgeIndex((prev) => (prev + 1) % badgeTexts.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = () => {
    const fullCommand = activeMethod === 'curl' 
      ? `${installCommands[activeMethod].command} | bash`
      : installCommands[activeMethod].command;
    navigator.clipboard.writeText(fullCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <section className="min-h-screen flex flex-col justify-center items-center pt-[70px] px-6">
        <div className="max-w-[900px] mx-auto w-full text-center">
          {/* Version tag */}
          <div className="flex justify-center mb-4">
            <div className="px-3 py-1 bg-primary/10 text-primary text-[12px] font-mono rounded-md">
              v0.1.6-beta
            </div>
          </div>

          {/* Computing badge */}
          <div className="flex justify-center mb-10">
            <div className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-full">
              <span className="text-primary">◆</span>
              <span className="text-primary text-[15px]">
                <span key={currentBadgeIndex} className="inline-block animate-fade-in">
                  {badgeTexts[currentBadgeIndex]}
                </span>
              </span>
            </div>
          </div>

          {/* Main headline */}
          <h1 className="text-[28px] md:text-[56px] leading-[1.1] mb-8 tracking-tight font-semibold">
            The open source SWE agent
          </h1>

          {/* Subheadline */}
          <p className="text-[17px] md:text-[19px] text-muted-foreground leading-relaxed mb-10 max-w-[700px] mx-auto">
            Free models included or connect any model from any provider,<br />
            including Claude, GPT, Gemini and more.
          </p>

          {/* Install CTA - Tabbed style */}
          <div className="max-w-[600px] mx-auto mb-6">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Tabs */}
              <div className="flex items-center border-b border-border">
                {(Object.keys(installCommands) as InstallMethod[]).map((method) => (
                  <button
                    key={method}
                    onClick={() => setActiveMethod(method)}
                    className={`px-5 py-3 text-[14px] font-mono transition-colors relative ${
                      activeMethod === method
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {method}
                    {(method === 'npm' || method === 'npx') && (
                      <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded font-semibold leading-none">live</span>
                    )}
                    {activeMethod === method && (
                      <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
                    )}
                  </button>
                ))}
              </div>

              {/* Command display */}
              <div className="flex items-center justify-between px-5 py-4">
                <code className="text-[14px] font-mono">
                  <span className="text-muted-foreground">
                    {installCommands[activeMethod].command.split(installCommands[activeMethod].highlight)[0]}
                  </span>
                  <span className="text-primary font-semibold">
                    {installCommands[activeMethod].highlight}
                  </span>
                  {activeMethod === 'curl' && (
                    <>
                      <span className="text-muted-foreground"> | </span>
                      <span className="text-foreground">bash</span>
                    </>
                  )}
                </code>
                <button 
                  onClick={handleCopy}
                  className="ml-4 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Documentation link */}
          <p className="text-[14px] text-muted-foreground">
            Or read the <a href={DOCS_URL} 
              className="text-foreground underline underline-offset-4 hover:text-primary transition-colors">documentation</a>
          </p>
        </div>
      </section>

      {/* Beta Section */}
      {/* <section className="py-24 px-6 border-t border-border">
        <div className="max-w-[900px] mx-auto text-center">
          <h2 className="text-[36px] md:text-[48px] leading-[1.15] mb-6 tracking-tight font-semibold">
            The Open Source Software Engineer
          </h2>
          <p className="text-[17px] md:text-[19px] text-muted-foreground leading-relaxed max-w-[700px] mx-auto">
            Use supercode with your free models. Free models are available,<br />
            including GPT, Gemini, Minimax, Deepseek and more.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary text-[14px] rounded-full font-medium">
            currently in beta
          </div>
        </div>
      </section> */}
    </>
  );
};

export default HeroSection;