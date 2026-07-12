# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Server-side Composio session proxy — CLI fetches composio MCP session from Render server's env var instead of requiring local `COMPOSIO_API_KEY` in `.env`
- New `POST /api/composio/session` backend endpoint authenticated via bearer token
- `createSessionFromServer()` method on `ComposioSessionManager` — fallback chain: server proxy → local SDK → user prompt
- Paid tier interest check on `init`

### Changed

- CLI `init` auto-restore: tries server-side composio session first before falling back to local SDK
- `/mcp` interactive flow: tries server-side session before prompting for API key
- `ensureComposioConnected()` now attempts server-side connection before local SDK
- Version bumped to 0.1.61

### Fixed

- Composio 401 `Invalid API key` error on init — no longer requires users to manually add API key to `.env`

---

## [0.1.60] — 2026-07-12

### Added

- Scroll-windowing UI for @-picker, slash commands, and model selector
- AtPicker with fuzzy file search (`at-picker.ts`, `file-search.ts`)
- Typing animation in `MarkdownStream.renderStyled()` (`markdown-stream.ts`)
- Allowed models: kimi-k2.6, deepseek-v4-flash, minimax-m3, glm-5.2, glm-5.1, claude-opus-4.8, gpt-5.5

### Changed

- Slash command list uses scroll-windowing (max 10 visible, scroll indicators) in `chat.ts`
- Model picker uses scroll-windowed inline UI via custom raw-stdin handler (replaced `@clack/prompts` select) in `model.ts`
- Extended provider/model lists to support redesigned picker

---

## [0.1.53] — 2026-07-10

### Added

- Product Hunt launch banner
- `/download` page with navbar download button
- Claude Opus 4.8 integration through ConcentrateAI with daily budget caps
- ElevenLabs Scribe support with noise-injected transcription handling
- Exa search/fetch as alternative web search provider
- Firecrawl tools (search, scrape) proxied through Render server when local API key missing
- Brand guidelines and contact pages
- Tool result restructuring and Firecrawl slash commands
- Code review analysis prompt
- Non-empty tool results detection
- LICENSE (MIT) — project is now open source
- Community health files: CODE_OF_CONDUCT, SECURITY, CONTRIBUTING, SUPPORT
- GitHub issue templates (bug report + feature request)
- Pull request template
- GitHub Actions CI workflow (typecheck, lint, test)
- Dependabot configuration for automated dependency updates
- `FUNDING.yml` for GitHub Sponsors

### Changed

- AGENTS.md: removed internal session data and exposed credentials
- README: added CI badges, license link, contributor guide
- Turbo configuration: added `test` task
- Root `package.json`: added OSS metadata (description, repository, keywords)
- Opus 4.8 model provider from Anthropic → ConcentrateAI → Azure
