"use client";

import React, { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';

const rotatingWords = ['developers', 'startups', 'teams', 'builders', 'creators'];
const badgeTexts = ['Computing...', 'Building...', 'Deploying...', 'Shipping...', 'Creating...'];

type InstallMethod = 'curl' | 'npm' | 'bun' | 'brew' | 'paru';

const installCommands: Record<InstallMethod, { command: string; highlight: string }> = {
  curl: { command: 'curl -fsSL https://supercode.ai/install', highlight: 'supercode.ai/install' },
  npm: { command: 'npm install -g supercode', highlight: 'supercode' },
  bun: { command: 'bun install -g supercode', highlight: 'supercode' },
  brew: { command: 'brew install supercode', highlight: 'supercode' },
  paru: { command: 'paru -S supercode', highlight: 'supercode' },
};

const HeroSection = () => {
  const [copied, setCopied] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentBadgeIndex, setCurrentBadgeIndex] = useState(0);
  const [activeMethod, setActiveMethod] = useState<InstallMethod>('curl');

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => (prev + 1) % rotatingWords.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

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
    <section className="min-h-screen flex flex-col justify-center items-center pt-[70px] px-6">
      <div className="max-w-[900px] mx-auto w-full text-center">
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

        {/* Main headline with rotating word */}
        <h1 className="text-[52px] md:text-[80px] leading-[1] mb-8 tracking-tight">
          <span className="text-foreground font-light italic" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Built for </span>
          <span className="text-primary font-light italic inline-flex items-center gap-3" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
            <span className="relative">
              <span key={currentWordIndex} className="inline-block animate-fade-in">
                {rotatingWords[currentWordIndex]}
              </span>
            </span>
            <span className="text-primary">&gt;</span>
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-[17px] md:text-[19px] text-muted-foreground leading-relaxed mb-10 max-w-[700px] mx-auto">
          Work with superCli directly in your codebase. Build, debug, and ship from your terminal,<br className="hidden md:block" />
          IDE, Slack, or the web. Describe what you need, and superCli handles the rest.
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
          Or read the <a href="#" className="text-foreground underline underline-offset-4 hover:text-primary transition-colors">documentation</a>
        </p>
      </div>
    </section>
  );
};

export default HeroSection;