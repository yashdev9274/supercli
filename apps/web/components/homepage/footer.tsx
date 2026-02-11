import React from 'react';
import { Github, Twitter } from 'lucide-react';

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:3001';

const Footer = () => {
  return (
    <footer className="border-t border-border py-12 px-12 mt-20">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <a href="/" className="flex items-center">
              <span className="text-[16px] font-bold text-foreground font-mono">Supercode</span>
            </a>
            <span className="text-[13px] text-muted-foreground font-mono">
              © 2026 Supercode Inc.
            </span>
          </div>
          
          <div className="flex items-center gap-6">
            <a href="#" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors font-mono">
              Privacy
            </a>
            <a href="#" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors font-mono">
              Terms
            </a>
            <a href={DOCS_URL} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors font-mono">
              Docs
            </a>
            <div className="flex items-center gap-4 ml-4">
              <a
                href="https://github.com/yashdev9274/superCli" 
                className="text-muted-foreground hover:text-foreground transition-colors">
                <Github className="w-4 h-4" />
              </a>
              <a 
                href="https://x.com/dew_yashtwt" 
                className="text-muted-foreground hover:text-foreground transition-colors">
                <Twitter className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;