import Link from "next/link";
import { MoveLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-background text-foreground px-4">
      <div className="space-y-6 text-center max-w-md">
        <h1 className="text-8xl font-bold tracking-tighter">404</h1>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold uppercase tracking-widest text-muted-foreground">
            Page Not Found
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            The page you are looking for might have been moved, deleted, or
            possibly never existed in this repository.
          </p>
        </div>
        <div className="pt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-none border border-border bg-secondary px-6 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <MoveLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
      
      {/* Decorative terminal-style background element */}
      <div className="absolute bottom-8 left-8 hidden lg:block opacity-10">
        <pre className="text-xs font-mono text-muted-foreground leading-tight">
          {`$ grep -r "page" .
grep: .: No such file or directory
$ exit 404`}
        </pre>
      </div>
    </div>
  );
}
