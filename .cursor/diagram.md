# SuperCLI -> Monorepo Migration Diagram (Excalidraw-ready)

```mermaid
flowchart TD
    %% Current State
    subgraph Current[Current State - Single App Repo]
        CURR[supercli root<br/>Next.js app + api routes + prisma]
    end

    %% Migration Flow
    CURR -->|migrate| MIGRATION

    subgraph MIGRATION[Migration Phases]
        P1[Phase 1<br/>Bootstrap monorepo<br/>Create apps/packages<br/>Move app -> apps/web<br/>Add workspaces + turbo]
        
        P1 --> G1{App runs unchanged?}
        G1 -->|No| F1[Fix path/import/build issues]
        F1 --> G1
        G1 -->|Yes| P2

        P2[Phase 2<br/>Extract shared foundations<br/>packages/db -> auth -> ui -> dashboard]
        P2 --> G2{Each extraction deployable?}
        G2 -->|No| F2[Rollback phase commit<br/>and re-cut smaller]
        F2 --> G2
        G2 -->|Yes| P3

        P3[Phase 3<br/>Add apps/api + packages/sdk<br/>Switch web/cli to sdk contracts]
        P3 --> P4[Phase 4<br/>Create apps/supercode-cli<br/>Wire auth + API + activity events]
        P4 --> P5[Phase 5<br/>Shared dashboard product switch<br/>/reviews and /agents]
        P5 --> P6[Phase 6<br/>CI/CD split + turbo cache<br/>Independent deploys]
    end

    %% Target Architecture
    MIGRATION --> TARGET

    subgraph Target[Target State - Turborepo Monorepo]
        ROOT[repo root<br/>package.json workspaces + turbo.json]

        subgraph Apps[apps/*]
            WEB[apps/web<br/>Single website + shared dashboard shell]
            API[apps/api<br/>Shared backend APIs]
            CLI[apps/supercode-cli<br/>Terminal coding agent]
        end

        subgraph Packages[packages/*]
            UI[packages/ui<br/>Shared UI primitives + theme]
            AUTH[packages/auth<br/>Shared auth/session]
            DB[packages/db<br/>Prisma schema + migrations]
            SDK[packages/sdk<br/>Typed contracts + API client]
            DASH[packages/dashboard<br/>Shared dashboard modules]
            CFG[packages/config<br/>ESLint/TS/Tailwind presets]
        end

        %% Dependencies
        WEB -->|uses| UI
        WEB -->|uses| AUTH
        WEB -->|uses| DASH
        WEB -->|uses| SDK

        CLI -->|uses| SDK
        CLI -->|auth helpers| AUTH

        API -->|uses| AUTH
        API -->|db access| DB
        API -->|exports contracts| SDK

        %% Routes
        WEB -.route.-> REV[/dashboard/reviews<br/>SuperCLI/]
        WEB -.route.-> AGT[/dashboard/agents<br/>Supercode/]

        %% Workspace structure
        ROOT --> WEB
        ROOT --> API
        ROOT --> CLI
        ROOT --> UI
        ROOT --> AUTH
        ROOT --> DB
        ROOT --> SDK
        ROOT --> DASH
        ROOT --> CFG
    end

    %% Guardrails
    subgraph Guardrails[Migration Guardrails]
        R1[Only packages/db owns migrations]
        R2[No duplicated auth across web/api/cli]
        R3[Shared dashboard stays product-agnostic]
        R4[Feature flags for incomplete modules]
        R5[Do not start next phase until current is deployable]
    end

    Guardrails -->|ensures| Stable[Stable shared platform]
    Stable -->|protects| Target

    %% Styling for Excalidraw
    classDef current fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef migration fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef target fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef guardrails fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef apps fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef packages fill:#e0f2f1,stroke:#004d40,stroke-width:2px

    class CURR current
    class P1,P2,P3,P4,P5,P6,G1,G2,F1,F2 migration
    class ROOT,WEB,API,CLI,UI,AUTH,DB,SDK,DASH,CFG,REV,AGT target
    class R1,R2,R3,R4,R5,Guardrails,Stable guardrails
    class WEB,API,CLI apps
    class UI,AUTH,DB,SDK,DASH,CFG packages
```

## Key Architecture Points

- **Single Web App**: One shared web app (`apps/web`) with route-based product areas (`/dashboard/reviews` for SuperCLI, `/dashboard/agents` for Supercode)
- **Contract Center**: `apps/api` and `packages/sdk` become the contract hub for both web and CLI
- **Shared Foundation**: Auth, DB, UI, dashboard shell, and config move to packages
- **Phased Migration**: Each phase is validated and deployable before proceeding
- **Guardrails**: Strict rules prevent common monorepo pitfalls

## Migration Safety Net

The diagram shows how each phase has validation gates and rollback options, ensuring the migration can proceed safely without breaking the existing application.