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
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.5"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.5
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 8, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Core</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- New OpenRouter models: MiniMax M3, GLM 5.1, and Kimi K2.6 (free).</li>
                  <li>- Session token tracking with context window percentage display (<code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">136.4K (68%)</code>) in chat footer.</li>
                  <li>- <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">maxOutputTokens</code> cap (8192) for paid OpenRouter models to prevent 402 errors.</li>
                  <li>- Render cold start error message improved — "server was inactive" instead of "cannot reach server".</li>
                  <li>- Human-readable token formatting (<code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">5.2K</code>, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">136.4K</code>, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">1.0M</code>).</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Docs</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Rewamp authentication docs covering CLI device code flow, token storage, GitHub OAuth, and Render cold start troubleshooting.</li>
                  <li>- Rewamp terminal architecture docs reflecting actual codebase (CLI commands, DB models, API endpoints, AI providers, deployment).</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.4"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.4
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 8, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Core</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Server-side AI streaming endpoint (<code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/api/ai/chat</code>) for proxied chat completions through Google, OpenRouter, MiniMax, and NVIDIA.</li>
                  <li>- ServerProxyService for secure AI provider request routing (API keys stay server-side).</li>
                  <li>- Structured generation endpoint (<code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/api/ai/generate-object</code>) for schema-guided AI output.</li>
                  <li>- CLI version display banner showing engine, auth, and model configuration.</li>
                  <li>- NVIDIA NIM streaming support with token usage tracking.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">supercode init</code> added as package script.</li>
                  <li>- <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">supercode login</code> added as package script.</li>
                  <li>- CLI commands executable via <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">bun run</code> in server package.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Web App</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Metadata updates and favicon added to dashboard.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.3
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 8, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Core</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Clearer AI provider configuration errors — each service now shows which env var to set when a key is missing.</li>
                  <li>- Provider logic refactored with per-service env var hints for Google, MiniMax, OpenRouter, and NVIDIA.</li>
                  <li>- Enhanced error messages for API key configuration.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.2
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 7, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Core</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- AI service integration refactor with improved error handling and model configuration.</li>
                  <li>- API client timeout support (15s default) for reliable network requests.</li>
                  <li>- OpenRouter AI SDK provider integrated alongside existing providers.</li>
                  <li>- Bearer token validation via Prisma session lookup for API auth.</li>
                  <li>- Device authorization form component for secure device-login UX.</li>
                  <li>- CORS configuration improved with server URL support.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Environment-aware config — loads <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">.env</code> from working directory, package path, and dist directory.</li>
                  <li>- Tool-assisted chat mode with interactive tool selection (multiselect).</li>
                  <li>- AI agent mode for generating full applications from descriptions.</li>
                  <li>- Conversation mode switching (chat / tools / agent).</li>
                  <li>- Workspace scanning with file tree rendering.</li>
                  <li>- Model selection prompts with provider-specific model lists.</li>
                  <li>- Documentation URL corrected in CLI banner.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Web App</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Device authorization page with code input form.</li>
                  <li>- Sign-in page with GitHub OAuth and email/password via Better-Auth.</li>
                  <li>- Redirect and error handling routes for auth flows.</li>
                  <li>- Next.js turbopack support with root path resolution.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.0"
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
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- New <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">supercode init</code> command with interactive chat and agent modes.</li>
                  <li>- <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">supercode login</code> command with device code authentication.</li>
                  <li>- Environment-aware configuration with <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">.env</code> loading from multiple locations.</li>
                  <li>- Tool system for AI — read files, search code, list directories, and execute commands.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Web App</h3>
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
