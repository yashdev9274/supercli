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
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.7"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.7
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 19, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Phosphor CRT terminal theme — green phosphor on black, amber accent for cursor/badges, green glow highlights. New <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">pixelWordmark()</code> renders "SUPERCODE" as ASCII pixel art.</li>
                  <li>- Main screen redesigned with <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">sectionHeader</code>, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">cardStack</code>, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">rowCard</code>, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">keyValue</code>, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">statusBar</code> utilities — centered pixel wordmark, system HUD panel, command card stack, and a footer status bar.</li>
                  <li>- Chat startup overhauled: pixel wordmark header, status bar with mode/model info, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/model</code> / <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/help</code> / <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">Tab</code> quick-start hint row.</li>
                  <li>- Framed "goodbye" message on exit instead of a single line.</li>
                  <li>- Animated thinking spinner with live tool call and reasoning updates (existing, refined).</li>
                  <li>- 1,048 insertions across 7 files — the TUI is now the primary surface identity.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Docs</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- README rewritten with new branding ("AI-Powered SWE Agent"), updated app/package table, Terminal Stack architecture section, and new badges (Next.js 16, License).</li>
                  <li>- CONTRIBUTING rewritten from scratch: Bun-first setup, both database setup steps (dashboard + terminal CLI), expanded project tree, full command reference, code style guidelines, CLI pattern doc, DB migration workflows.</li>
                  <li>- Config documentation updated with production URL guidance for OAuth setup — thanks <a href="https://github.com/aviisharma238" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">@aviisharma238</a>!</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.6
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 11, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Core</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Agent mode rewritten from rigid <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">generateApplication()</code> to tool-calling loop (<code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">ToolLoopAgent</code>) — model calls <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">write_file</code> and <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">run_command</code> tools directly for iterative building and error recovery.</li>
                  <li>- New <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/model</code> slash command — switch AI provider/model mid-session (Gemini, OpenRouter, NVIDIA NIM).</li>
                  <li>- Persistent stdin handler — prevents "terminal state may be corrupted" crashes.</li>
                  <li>- Stream cancellation via Escape key with partial response preservation.</li>
                  <li>- Global <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">unhandledRejection</code> and <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">uncaughtException</code> handlers for crash resilience.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Tools</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- New standalone tool definitions: <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">write-file</code>, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">run-command</code>, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">read-instructions</code> with path traversal protection, 1MB size limit, and auto mkdir support.</li>
                  <li>- <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">PermissionManager</code> — granular tool permission system with wildcard matching, dangerous command detection (20 regex patterns), and <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">[y] Once / [a] Always / [n] Deny</code> prompts.</li>
                  <li>- OpenRouter provider rewritten from SDK to raw <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">fetch</code> API with native tool call detection and multi-iteration tool loops.</li>
                  <li>- NVIDIA NIM provider migrated to <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">@ai-sdk/openai-compatible</code> SDK with proper tool-calling support.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Model switching at runtime via <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/model</code> command supporting Google Gemini, OpenRouter (GPT OSS, DeepSeek V4 Flash, MiniMax M3, GLM 5.1, Kimi K2.6), and NVIDIA NIM (MiniMax M2.7, DeepSeek V4 Flash, Llama 3.3 70B).</li>
                  <li>- Default OpenRouter model changed to <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">moonshotai/kimi-k2.6:free</code>.</li>
                  <li>- Animated thinking spinner with live tool call and reasoning updates.</li>
                  <li>- Agent mode shows live tool call progress with exit and continue prompts.</li>
                  <li>- Chat loop resilience — catch-all error handling prevents crashes; terminal state restored on errors.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

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
