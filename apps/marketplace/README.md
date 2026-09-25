# Supercode Review — Vercel Marketplace integration server

Native Marketplace Partner API for **Supercode Review** (AI PR code review), the same class of product as [CodeRabbit on Vercel Marketplace](https://vercel.com/marketplace/coderabbit).

This is **not** a storage/database product. The “resource” Vercel provisions is a **Supercode Review workspace** tied to a Supercode `Organization`; actual reviews still flow through the GitHub App + `apps/web` Inngest pipeline.

## Official process (from Vercel docs)

1. **Submit Create Integration** in [Integrations Console](https://vercel.com/dashboard/integrations/console)  
   https://vercel.com/docs/integrations/create-integration#creating-an-integration
2. **Native provider**: share `team_id` + URL slug with Vercel (Slack / marketplace program)  
   https://vercel.com/docs/integrations/create-integration#native-integration-product-creation  
   https://vercel.com/marketplace/program
3. **Deploy this app** → set **Base URL** + **Redirect Login URL** (`/callback`)
4. **Create Product** (`supercode-review`)  
   https://vercel.com/docs/integrations/create-integration/marketplace-product#create-your-product
5. Implement Partner API (this repo)  
   https://vercel.com/docs/integrations/create-integration/marketplace-api
6. **Publish / request review** → email `integrations@vercel.com`  
   https://vercel.com/docs/integrations/create-integration/marketplace-product#publish-your-product  
   Checklist: https://vercel.com/docs/integrations/create-integration/approval-checklist

Connectable-account integrations are a different path (OAuth redirect, Community badge, 500 installs for public listing). CodeRabbit-style listing is **native**.

## Local dev

```bash
# from monorepo root
bun install
bun run dev:marketplace
```

Copy `apps/marketplace/.env.example` → `.env.local`:

| Var | Purpose |
| --- | --- |
| `INTEGRATION_CLIENT_ID` | From Integrations Console credentials (`oac_…`) |
| `INTEGRATION_CLIENT_SECRET` | Console secret |
| `HOST` | Public Base URL (prod) or tunnel URL |
| `DATABASE_URL` | Same Postgres as `apps/web` |
| `SUPERCODE_APP_URL` | Where SSO sends users (dashboard) |
| `MARKETPLACE_PRODUCT_SLUG` | `supercode-review` |

Apply DB migration:

```bash
cd packages/db && bun run db:migrate
# or prisma migrate deploy
```

## Required Partner API endpoints

| Method | Path | Role |
| --- | --- | --- |
| `PUT` | `/v1/installations/{id}` | Upsert install → create/link Supercode org |
| `DELETE` | `/v1/installations/{id}` | Uninstall |
| `GET` | `/v1/installations/{id}` | Optional install state |
| `POST` | `/v1/installations/{id}/resources` | Provision Supercode Review resource |
| `GET` | `/v1/installations/{id}/resources/{rid}` | Get resource |
| `DELETE` | `/v1/installations/{id}/resources/{rid}` | Delete resource |
| `GET` | `/v1/products/{slug}/plans` | Free / Pro / Team plans |

Auth: Bearer OIDC JWT from `https://marketplace.vercel.com` (JWKS).

## Console form cheat sheet (Supercode Review)

| Field | Suggested value |
| --- | --- |
| Name | Supercode Review |
| URL Slug | `supercode-review` |
| Category | Dev Tools (or AI if available) |
| Website | https://supercodeai.com (or your marketing URL) |
| Documentation URL | `https://<this-host>/docs` |
| EULA URL | `https://<this-host>/terms` |
| Privacy Policy URL | `https://<this-host>/privacy` |
| Base URL | `https://<this-host>` |
| Redirect Login URL | `https://<this-host>/callback` |
| Product name | Supercode Review |
| Product slug | `supercode-review` |
| Short description | AI code review for PRs — catch bugs, ship faster |

Metadata schema can start empty:

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false,
  "required": []
}
```

## Deploy

```bash
# link a Vercel project to apps/marketplace
cd apps/marketplace
vercel link
vercel env pull
vercel --prod
```

Then paste the production URL into Integrations Console **Base URL** and **Redirect Login URL** (`…/callback`).

## User install flow (target UX)

1. Marketplace → Install Supercode Review  
2. Pick plan → provision resource  
3. Open in Supercode (SSO `/callback`) → install GitHub App  
4. Open test PR → AI review comments  

CLI (after listing): `vc i supercode-review`
