"use client";

import React from 'react';
import Link from 'next/link';

const Navbar = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-[100] bg-background/95 backdrop-blur-sm">
      <div className="h-[70px] flex items-center justify-between px-12 max-w-[1400px] mx-auto w-full">
        {/* Logo */}
        <a href="/" className="flex items-center">
          <span className="text-[22px] font-bold text-foreground tracking-tight font-mono">
            supercode
          </span>
        </a>

        {/* Desktop Menu */}
        <nav className="hidden md:flex items-center gap-10">
          <a 
            href="https://github.com/yashdev9274/superCli" 
            className="text-[15px] text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            GitHub <span className="text-muted-foreground/60"></span>
          </a>
          <a 
            href="#docs" 
            className="text-[15px] text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            Docs
          </a>
          <a 
            href="#enterprise" 
            className="text-[15px] text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            Enterprise
          </a>
          <a 
            href="#zen" 
            className="text-[15px] text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            
          </a>
        </nav>

        {/* Login CTA */}
        <Link 
          href="/login"
          className="px-5 py-2.5 bg-card border border-border text-foreground rounded-lg text-[14px] font-medium hover:bg-accent transition-colors font-mono"
        >
          Login
        </Link>
      </div>
    </header>
  );
};

export default Navbar;