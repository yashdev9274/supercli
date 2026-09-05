import prisma from "@super/db"
import { randomBytes } from "crypto"

import { env } from "../env"
import { slugify } from "../utils"
import type {
  InstallIntegrationRequest,
  ListResourcesResponse,
  Notification,
  ProvisionResourceRequest,
  ProvisionResourceResponse,
  Resource,
  ResourceStatusType,
  UpdateResourceRequest,
} from "../vercel/schemas"
import { getPlanById, getProductBillingPlans, SUPERCODE_REVIEW_PLANS } from "./plans"

export { getProductBillingPlans, getPlanById, SUPERCODE_REVIEW_PLANS }

function asNotification(value: unknown): Notification | undefined {
  if (!value || typeof value !== "object") return undefined
  return value as Notification
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

async function ensureOrganizationForInstallation(input: {
  installationId: string
  vercelAccountId: string
  accountName?: string
}): Promise<string> {
  const existing = await prisma.vercelInstallation.findUnique({
    where: { id: input.installationId },
  })
  if (existing?.organizationId) {
    return existing.organizationId
  }

  const baseName =
    input.accountName?.trim() ||
    `Vercel Team ${input.vercelAccountId.slice(0, 8)}`
  const baseSlug = slugify(baseName) || `vercel-${input.vercelAccountId.slice(0, 8)}`

  let slug = baseSlug
  let attempt = 0
  while (await prisma.organization.findUnique({ where: { slug } })) {
    attempt += 1
    slug = `${baseSlug}-${attempt}`
  }

  const org = await prisma.organization.create({
    data: {
      name: baseName,
      slug,
    },
  })

  return org.id
}

/**
 * PUT /v1/installations/{id}
 * Creates/updates installation, links a Supercode Organization, stores Vercel access token.
 */
export async function installIntegration(
  installationId: string,
  claims: { account_id: string },
  body: InstallIntegrationRequest,
) {
  const organizationId = await ensureOrganizationForInstallation({
    installationId,
    vercelAccountId: claims.account_id,
    accountName: body.account?.name,
  })

  await prisma.vercelInstallation.upsert({
    where: { id: installationId },
    create: {
      id: installationId,
      vercelAccountId: claims.account_id,
      organizationId,
      accessToken: body.credentials.access_token,
      tokenType: body.credentials.token_type,
      billingPlanId: "free",
      rawPayload: body as object,
      deletedAt: null,
      notification: {
        level: "info",
        title: "Connect GitHub to enable Supercode Review",
        message:
          "Open Supercode and install the GitHub App on the repos you want reviewed.",
        href: `sso:${env.SUPERCODE_APP_URL}/dashboard`,
      },
    },
    update: {
      vercelAccountId: claims.account_id,
      organizationId,
      accessToken: body.credentials.access_token,
      tokenType: body.credentials.token_type,
      rawPayload: body as object,
      deletedAt: null,
      updatedAt: new Date(),
    },
  })
}

export async function getInstallation(installationId: string) {
  return prisma.vercelInstallation.findUnique({
    where: { id: installationId },
  })
}

export async function updateInstallation(
  installationId: string,
  billingPlanId: string,
) {
  await prisma.vercelInstallation.update({
    where: { id: installationId },
    data: { billingPlanId },
  })
}

/**
 * DELETE installation — soft-delete + mark resources uninstalled.
 * Returns { finalized: true } so Vercel does not wait for async finalization.
 */
export async function uninstallInstallation(installationId: string) {
  const installation = await prisma.vercelInstallation.findUnique({
    where: { id: installationId },
  })
  if (!installation || installation.deletedAt) {
    return { finalized: true as const }
  }

  await prisma.$transaction([
    prisma.vercelResource.updateMany({
      where: { installationId },
      data: { status: "uninstalled" },
    }),
    prisma.vercelInstallation.update({
      where: { id: installationId },
      data: {
        deletedAt: new Date(),
        accessToken: null,
      },
    }),
  ])

  return { finalized: true as const }
}

function toResourceResponse(row: {
  id: string
  productId: string
  name: string
  status: string
  billingPlanId: string
  metadata: unknown
  notification: unknown
}): Resource {
  const plan = getPlanById(row.billingPlanId) ?? SUPERCODE_REVIEW_PLANS[0]!
  return {
    id: row.id,
    productId: row.productId,
    name: row.name,
    status: row.status as ResourceStatusType,
    metadata: asMetadata(row.metadata),
    billingPlan: plan,
    notification: asNotification(row.notification),
  }
}

/**
 * POST provision — creates a Supercode Review "resource" (review workspace)
 * and returns secrets Vercel can inject as env vars on connected projects.
 */
export async function provisionResource(
  installationId: string,
  body: ProvisionResourceRequest,
  options?: { status?: ResourceStatusType },
): Promise<ProvisionResourceResponse> {
  const installation = await prisma.vercelInstallation.findUnique({
    where: { id: installationId },
  })
  if (!installation || installation.deletedAt) {
    throw new Error("Installation not found")
  }

  const productId = body.productId || env.MARKETPLACE_PRODUCT_SLUG
  const billingPlanId = body.billingPlanId || "free"
  const plan = getPlanById(billingPlanId) ?? SUPERCODE_REVIEW_PLANS[0]!

  // API token the customer can use later; also synced as env on Vercel projects.
  const apiToken = `scr_${randomBytes(24).toString("hex")}`

  const resource = await prisma.vercelResource.create({
    data: {
      installationId,
      productId,
      name: body.name,
      status: options?.status ?? "ready",
      billingPlanId: plan.id,
      metadata: {
        ...(body.metadata ?? {}),
        organizationId: installation.organizationId,
        product: "supercode-review",
      },
      notification: {
        level: "info",
        title: "Finish setup: install Supercode GitHub App",
        message:
          "Supercode Review is provisioned. Install the GitHub App, then open a PR to get your first AI review.",
        href: `sso:${env.SUPERCODE_APP_URL}/dashboard`,
      },
    },
  })

  // Keep installation plan in sync with latest resource plan when relevant
  if (installation.billingPlanId !== plan.id) {
    await prisma.vercelInstallation.update({
      where: { id: installationId },
      data: { billingPlanId: plan.id },
    })
  }

  const base = toResourceResponse(resource)

  return {
    ...base,
    secrets: [
      {
        name: "SUPERCODE_REVIEW_TOKEN",
        value: apiToken,
      },
      {
        name: "SUPERCODE_REVIEW_RESOURCE_ID",
        value: resource.id,
      },
      {
        name: "SUPERCODE_APP_URL",
        value: env.SUPERCODE_APP_URL,
      },
    ],
  }
}

export async function listResources(
  installationId: string,
  ids?: string[],
): Promise<ListResourcesResponse> {
  const resources = await prisma.vercelResource.findMany({
    where: {
      installationId,
      status: { not: "uninstalled" },
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    orderBy: { createdAt: "desc" },
  })

  return {
    resources: resources.map(toResourceResponse),
  }
}

export async function getResource(installationId: string, resourceId: string) {
  const resource = await prisma.vercelResource.findFirst({
    where: { id: resourceId, installationId },
  })
  if (!resource || resource.status === "uninstalled") {
    return null
  }
  return toResourceResponse(resource)
}

export async function updateResource(
  installationId: string,
  resourceId: string,
  body: UpdateResourceRequest,
) {
  const existing = await prisma.vercelResource.findFirst({
    where: { id: resourceId, installationId },
  })
  if (!existing) {
    throw new Error("Resource not found")
  }

  const data: {
    name?: string
    billingPlanId?: string
    status?: string
    metadata?: object
  } = {}
  if (body.name !== undefined) data.name = body.name
  if (body.billingPlanId !== undefined) data.billingPlanId = body.billingPlanId
  if (body.status !== undefined) data.status = body.status
  if (body.metadata !== undefined) {
    data.metadata = {
      ...asMetadata(existing.metadata),
      ...body.metadata,
    }
  }

  const updated = await prisma.vercelResource.update({
    where: { id: resourceId },
    data,
  })

  return toResourceResponse(updated)
}

export async function deleteResource(
  installationId: string,
  resourceId: string,
) {
  const existing = await prisma.vercelResource.findFirst({
    where: { id: resourceId, installationId },
  })
  if (!existing) {
    return
  }

  await prisma.vercelResource.update({
    where: { id: resourceId },
    data: { status: "uninstalled" },
  })
}
