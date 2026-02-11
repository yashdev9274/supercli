"use client";

import React from 'react';
import Link from 'next/link';

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:3001';


const PixelLogo = () => {
    return (
      <svg width="140" height="18" viewBox="0 0 140 18" fill="none" xmlns="http://www.w3.org/2000/svg">
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

const Navbar = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-[100] bg-background/95 backdrop-blur-sm">
      <div className="h-[70px] flex items-center justify-between px-12 max-w-[1400px] mx-auto w-full">
        {/* Logo */}
        <a href="/" className="flex items-center">
          <PixelLogo />
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
            href={DOCS_URL}
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