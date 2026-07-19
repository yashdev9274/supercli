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
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.77"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.77
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 19, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">BYOK / Provider</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Enhanced BYOK provider management with session-only API key auto-fallback for multiple providers.</li>
                  <li>- Streamlined API key retrieval logic across all BYOK commands — reduced duplication.</li>
                  <li>- Chat input now shows placeholder text when empty for clearer UX.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.76"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.76
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 19, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">BYOK / Provider</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Session-only BYOK provider now falls back to cloud provider when session key is missing — smoother provider experience.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.75"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.75
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 19, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">BYOK / Provider</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- ConcentrateAI key management refactored to support multiple environment variables.</li>
                  <li>- Clearer error messages when API keys are missing — shows exactly which env var to set.</li>
                  <li>- Cleaned up old persisted ConcentrateAI keys; fully transitioned to session-only BYOK variables.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.74"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.74
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 19, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Removed custom model entry from model selection for a cleaner, simpler UX.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.73"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.73
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 18, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- New <strong>"supercode" cloud model provider</strong> with enhanced API integration for chat and task generation.</li>
                  <li>- New user interaction tools: <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">question</code> (ask user during agent runs) and <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">todowrite</code> (inline task tracking).</li>
                  <li>- Permission management extended to cover question/todo tool usage.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.72"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.72
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 17, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Infrastructure</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Bug fix and npm version update.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.71"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.71
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 17, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Infrastructure</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- npm version update and publish.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.70"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.70
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 17, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Providers</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Major provider expansion: <strong>ConcentrateAI</strong>, <strong>Merge Dev Gateway</strong>, <strong>Google Gemini</strong>, <strong>MiniMax</strong>, <strong>NVIDIA NIM</strong>, and <strong>OpenRouter</strong>.</li>
                  <li>- Improved model selection with provider-specific filtering and better categorization.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.69"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.69
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 17, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- "supercode" added as a cloud model provider in the provider interface.</li>
                  <li>- Default provider for chat and agent functions switched to <strong>supercode</strong>.</li>
                  <li>- Model selection refactored to clearly distinguish between cloud and BYOK models.</li>
                  <li>- Better error handling for API key configuration in <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">createProvider</code>.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.68"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.68
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 16, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Connection type (<code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">direct</code> vs <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">proxy</code>) added to AI provider interface.</li>
                  <li>- Chat UI and status bar now display connection type for the active provider.</li>
                  <li>- Model selection enhanced to support new providers and models.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.67"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.67
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 16, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Tool call repetition guard — prevents infinite loops by tracking tool call history.</li>
                  <li>- Tool call history tracking integrated across all AI services.</li>
                  <li>- Citation tracking performance improvements.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.66"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.66
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 16, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Build agent prompts enhanced with review and analysis workflow steps.</li>
                  <li>- Better AI response streaming — improved handling of tool preferences and task descriptions.</li>
                  <li>- New <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/connectors</code> command for managing app connectors, including Merge Agent Handler setup.</li>
                  <li>- New code highlighting utility for improved code presentation in CLI outputs.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.65"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.65
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 14, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- New <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/new</code> command — clears session messages and starts a fresh conversation.</li>
                  <li>- <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">renderChatHeader</code> function improves chat interface presentation.</li>
                  <li>- Enhanced chat loop for new conversation and session management commands.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.64"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.64
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 14, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Docs</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Mercury MCP Integration Security & Architecture Guide published — covers end-to-end architecture, OAuth flow, permission enforcement, data handling protocols, and tool naming conventions.</li>
                  <li>- Includes structural diagrams and key architectural invariants.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.63"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.63
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 14, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Tool parameter handling improvements — <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">toolParams</code> returns a default object structure when necessary.</li>
                  <li>- <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">nonStreamingRequest</code> accepts tools as an optional parameter.</li>
                  <li>- ConcentrateService tracks tool events during streaming responses.</li>
                  <li>- Simplified chat initialization in <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">wakeUpAction</code> for clarity and efficiency.</li>
                  <li>- New model entry: <strong>Opus 4.8</strong>.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.62"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.62
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 13, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">MCP / Composio</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Enhanced Composio app management — improved MCP slash command UI and server-side session handling.</li>
                  <li>- Server-side endpoint refactored for better Composio session creation and management.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Dependencies</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Added <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">nodemailer</code> for email handling capabilities.</li>
                  <li>- Added <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">@dodopayments/nextjs</code> and <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">dodopayments</code> packages for payment processing.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.61"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.61
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 12, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">MCP / Composio</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Server-side Composio session proxy — CLI fetches composio MCP session from server&#39;s Render env instead of requiring a local <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">COMPOSIO_API_KEY</code> in <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">.env</code>.</li>
                  <li>- New <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">POST /api/composio/session</code> server endpoint creates composio sessions server-side using the Render env var.</li>
                  <li>- CLI <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">init</code> auto-restore tries server-side composio session first, falls back to local SDK.</li>
                  <li>- <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/mcp</code> interactive flow tries server-side session before prompting for API key.</li>
                  <li>- Fixed Composio 401 <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">Invalid API key</code> on init — users no longer need to manually configure API key in <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">.env</code>.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Paid tier interest check on <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">init</code>.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.60"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.60
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 12, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Scroll-windowing UI for <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">@</code>-picker, slash commands, and model selector — max 10 visible with scroll indicators.</li>
                  <li>- New <strong>AtPicker</strong> with fuzzy file search for quick file lookup mid-chat.</li>
                  <li>- Typing animation in markdown stream rendering for more natural output.</li>
                  <li>- Model picker rewritten with scroll-windowed inline UI (replaced <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">@clack/prompts</code> select).</li>
                  <li>- Extended allowed model list: kimi-k2.6, deepseek-v4-flash, minimax-m3, glm-5.2, glm-5.1, claude-opus-4.8, gpt-5.5.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.53"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.53
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jul 10, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Web App</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Redesigned /launch page for Product Hunt launch (July 10, 2026) with beta features, "coming next" roadmap, and inline install commands.</li>
                  <li>- New changelog section on /launch page showcasing what's new since beta.</li>
                  <li>- Partnerships section with polished get-started terminal on homepage.</li>
                  <li>- Web research stats page (<code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/stats</code>) with GitHub Stars counter.</li>
                  <li>- Beta countdown banner and launch celebration UI.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Firecrawl Web Research</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Added Firecrawl web research tools: <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/search</code>, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/scrape</code>, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/map</code> slash commands.</li>
                  <li>- Exa search/fetch as alternative web search provider.</li>
                  <li>- Tools proxy through Render server when local API key is missing.</li>
                  <li>- Fixed "not configured" error — loads .env before env var check.</li>
                  <li>- Removed legacy web_search tool set; unified under Firecrawl.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Voice / STT</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- ElevenLabs Scribe support for noise-injected transcription with improved accuracy.</li>
                  <li>- Fixed ElevenLabs API key environment variable handling.</li>
                  <li>- Improved retry UX for voice transcription.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Enhanced tool result processing with structured output and code review analysis prompts.</li>
                  <li>- Enhanced message formatting in ConcentrateService for better AI interaction quality.</li>
                  <li>- Improved agent loop with non-empty tool result detection.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Infrastructure</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Repository prepared for open source with MIT LICENSE.</li>
                  <li>- Community health files: CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, SUPPORT.</li>
                  <li>- GitHub Actions CI workflow (typecheck, lint, test), Dependabot, issue + PR templates.</li>
                  <li>- Local dev setup documentation (Docker, Quick Start, env defaults).</li>
                  <li>- <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">@infisical/sdk</code> bumped from unpublished v0.0.30 to v5 with API migration.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.27"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.27
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 29, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Analytics</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- New usage tracking and analytics feature for monitoring CLI usage patterns.</li>
                  <li>- Improved error handling in analytics route for better reliability.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Agent Enhancements</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Enhanced agent functionality with improved tool call handling (v0.1.19, v0.1.24).</li>
                  <li>- Better tool result processing for more reliable agent responses.</li>
                  <li>- Refined output formatting across the CLI (v0.1.18).</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Auto-Update</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- New auto-update mechanism to keep supercode-cli up to date (v0.1.21).</li>
                  <li>- Improved update error handling and diagnostics (v0.1.22).</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Model Support</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Added GLM 5.2 support to ConcentrateAI provider (v0.1.17).</li>
                  <li>- Updated model references and configurations (v0.1.26).</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Infrastructure</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Refactored Prisma integration for cleaner database access (v0.1.23).</li>
                  <li>- Dependency updates across the monorepo.</li>
                  <li>- Device code timestamps migration for auth flows.</li>
                  <li>- Removed remotion video sub-repo to clean up workspace.</li>
                  <li>- Added Star History section to README.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.16"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.16
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 26, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- <strong>4 modes → 2.</strong> Chat, tool, agent, and plan modes collapsed into two: <strong>chat</strong> (read-only workspace access: read_file, search_files, url_fetch, browse, etc.) and <strong>agent</strong> (full workspace + all tools, including write).</li>
                  <li>- New <strong>AgentService</strong> with 7 built-in agents (build, plan, general, explore, compaction, title, summary) each with permission profiles and prompt files.</li>
                  <li>- New <strong>permission module</strong> — Ruleset types, wildcard matching, and <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">mergePermissions</code> for granular tool access control.</li>
                  <li>- <strong>GLM 5.2</strong> added to ConcentrateAI provider.</li>
                  <li>- New <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/context-window</code> slash command — shows token usage breakdown per message with context percentage. 240-line implementation with detailed rendering.</li>
                  <li>- Narrowed <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">CliConfig.mode</code> type to <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">"chat" | "agent"</code>.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Web App</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Comparison page (<code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/compare</code>) redesigned with detailed feature breakdown and improved layout.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.14"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.14
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 23, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- OpenRouter integration rewritten: dropped <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">@openrouter/ai-sdk-provider</code> dependency, migrated to raw <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">fetch</code> API with SSE streaming and proper token usage tracking.</li>
                  <li>- Server-side OpenRouter chat endpoint now streams tool calls with <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">tool-call</code> typed events.</li>
                  <li>- OpenRouter structured generation endpoint migrated from SDK to raw API.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.13"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.13
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 23, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- New <strong>ConcentrateAI</strong> provider — OpenAI-compatible AI gateway with models: DeepSeek V4 Flash, Kimi K2.6, GLM 5.1, and MiniMax M2.7.</li>
                  <li>- ConcentrateAI set as <strong>default provider</strong> for chat, agent, and tools modes (replaces Google Gemini).</li>
                  <li>- New <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">ConcentrateService</code> with streaming, tool calling, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">maxSteps: 25</code> tool loop, and abort signal support.</li>
                  <li>- Model browser redesigned: unified interface across all providers with cost multipliers, current-model indicators, and "Set as default" persistence via config file.</li>
                  <li>- Context window tracking added for ConcentrateAI models.</li>
                  <li>- Server-side endpoints for ConcentrateAI: streaming chat and object generation.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.12"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.12
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 23, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Per-model <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">maxTokens</code> configuration for server-side chat and object generation endpoints, preventing 402 errors on paid models.</li>
                  <li>- Kimi K2.6 model reference updated (removed <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">:free</code> suffix) — now a paid model across model lists, help docs, and context window config.</li>
                  <li>- Default OpenRouter model max tokens tuned per model (Kimi K2.6: 256, DeepSeek V4 Flash: 4096, GLM 5.1: 256).</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.11"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.11
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 23, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Server-side chat endpoint refactored to use <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">@openrouter/ai-sdk-provider</code> with <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">streamText</code> — cleaner streaming, built-in tool loop (<code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">maxSteps: 5</code>), and proper usage reporting.</li>
                  <li>- Removed 200+ lines of manual SSE parsing and tool loop logic in favor of SDK handling.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Homepage</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Launch page enhanced with beta features list, "coming next" roadmap, and install command section.</li>
                  <li>- Post-launch CTA updated to link to Quickstart guide with <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">npm install -g supercode-cli@latest</code> hint.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.10"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.10
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 22, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Launch</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- <strong>Public beta launch</strong> 🚀 — supercode is now live and available for everyone to install.</li>
                  <li>- Beta countdown page with animated banner and launch celebration UI.</li>
                  <li>- Launch page redesigned with beta features list, "coming next" roadmap, and inline install command.</li>
                  <li>- Post-launch CTA links to Quickstart guide for first-time users.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Docs</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- New <strong>Quickstart</strong> guide — step-by-step install/login/first-prompt walkthrough at <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/docs/quickstart</code>.</li>
                  <li>- Docs site redesign: typography overhaul, section-grouped sidebar (Getting Started / Terminal), prev/next page pagination, scroll-aware "On this page" TOC with active highlights.</li>
                  <li>- Polished terminal blocks with macOS-style title bar and copy feedback animation.</li>
                  <li>- New header with pixel logo, Docs / Home / GitHub nav links, and improved footer with prev/next navigation.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Redesigned device approval screen with terminal-themed UI, <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">PixelLogo</code> component, and simplified device code entry form.</li>
                  <li>- Cleaned-up login form and server dependency updates.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Homepage</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Updated hero, footer, and navbar with beta launch links and version metadata.</li>
                  <li>- Tabbed install commands (curl / npm / bun / npx / brew) with copy-to-clipboard.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.9"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.9
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 21, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">CLI / TUI</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- New <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/connect</code> command — interactive provider setup for OpenAI, Anthropic, Google Gemini, and more.</li>
                  <li>- AI model management enhanced with provider-specific configuration and model lists.</li>
                  <li>- Provider connection functionality with API key validation and persistence.</li>
                  <li>- CLI help documentation updated with new commands and configuration options.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section>
            <div className="flex items-baseline gap-4 mb-8">
              <h2 className="text-[24px] font-semibold tracking-tight">
                <a
                  href="https://github.com/yashdev9274/supercli/releases/tag/v0.1.8"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary underline underline-offset-4 transition-colors"
                >
                  v0.1.8
                </a>
              </h2>
              <span className="text-[14px] text-muted-foreground font-mono">Jun 20, 2026</span>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-[17px] text-white font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Web App</h3>
                <ul className="space-y-3 text-[14px] leading-relaxed text-foreground/85">
                  <li>- Waitlist feature with email notifications and Inngest integration.</li>
                  <li>- Beta launch countdown page with animated banner component.</li>
                  <li>- Launch page added to footer navigation.</li>
                  <li>- Open Graph images updated for social sharing.</li>
                  <li>- Comparison page — Supercode vs other SWE agents with highlighted differentiators.</li>
                  <li>- Changelog page published at <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[13px] font-mono">/changelog</code>.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-border" />

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
