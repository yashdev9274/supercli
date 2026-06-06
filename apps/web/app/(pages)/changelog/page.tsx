import Navbar from "@/components/homepage/navbar";
import Footer from "@/components/homepage/footer";

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-background dark relative">
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      <div className="pt-[120px] pb-24 px-6 max-w-[720px] mx-auto">
        <h1 className="text-[36px] md:text-[48px] font-semibold tracking-tight mb-2">
          Changelog
        </h1>
        <p className="text-muted-foreground text-[16px] mb-16">
          New updates and improvements to supercode
        </p>

        <div className="space-y-16">
          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/superCli"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.0
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 6, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Core</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- AI coding agent with multi-provider support — Google Gemini, OpenAI, Anthropic Claude, Minimax, NVIDIA, and OpenRouter.</li>
                  <li>- Free models included — GPT, Gemini, Minimax, Deepseek and more available out of the box.</li>
                  <li>- AI-powered chat interface with streaming responses, tool execution, and workspace context awareness.</li>
                  <li>- Device code authentication flow with GitHub OAuth for secure CLI login.</li>
                  <li>- WebSocket server for real-time AI streaming and tool execution.</li>
                  <li>- Multi-session support with conversation history and message persistence.</li>
                  <li>- Prisma-backed database with PostgreSQL for users, sessions, workspaces, and API keys.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px]  text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- New <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">supercode init</code> command with interactive chat and agent modes.</li>
                  <li>- <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">supercode login</code> command with device code authentication.</li>
                  <li>- Environment-aware configuration with <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">.env</code> loading from multiple locations.</li>
                  <li>- Tool system for AI — read files, search code, list directories, and execute commands.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white  font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Web App</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Terminal client at <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">supercode-terminal.vercel.app</code> with session management and workspace file explorer.</li>
                  <li>- Device authorization and approval pages for secure device login.</li>
                  <li>- Sign-in page with email/password and GitHub OAuth via Better-Auth.</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Footer />
    </main>
  );
}
