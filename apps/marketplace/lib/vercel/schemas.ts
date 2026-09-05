import { z } from "zod"

export const datetimeSchema = z.string().datetime()

export const resourceStatusSchema = z.enum([
  "ready",
  "pending",
  "onboarding",
  "suspended",
  "resumed",
  "uninstalled",
  "error",
])

export type ResourceStatusType = z.infer<typeof resourceStatusSchema>

const metadataSchema = z.record(z.string(), z.unknown())

const notificationSchema = z.object({
  level: z.enum(["info", "warn", "error"]),
  title: z.string().max(100),
  message: z.string().optional(),
  href: z.string().optional(),
})

export type Notification = z.infer<typeof notificationSchema>

export const billingPlanSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["prepayment", "subscription"]),
  name: z.string().min(1),
  description: z.string().min(1),
  scope: z.enum(["installation", "resource"]).optional().default("resource"),
  paymentMethodRequired: z.boolean().optional().default(true),
  preauthorizationAmount: z.number().optional(),
  cost: z.string().min(1).optional(),
  highlightedDetails: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1).optional(),
      }),
    )
    .optional(),
  details: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1).optional(),
      }),
    )
    .optional(),
  requiredPolicies: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        url: z.string().min(1),
      }),
    )
    .optional(),
  effectiveDate: datetimeSchema.optional(),
  disabled: z.boolean().optional(),
})

export type BillingPlan = z.infer<typeof billingPlanSchema>

const resourceSecretsSchema = z.array(
  z.object({
    name: z.string().min(1),
    value: z.string().min(1),
    environmentOverrides: z
      .object({
        development: z.string().optional(),
        preview: z.string().optional(),
        production: z.string().optional(),
      })
      .optional(),
  }),
)

export const installIntegrationRequestSchema = z.object({
  scopes: z.array(z.string()),
  acceptedPolicies: z.record(z.string(), datetimeSchema),
  credentials: z.object({
    access_token: z.string().min(1),
    token_type: z.string().min(1),
  }),
  account: z
    .object({
      name: z.string().optional(),
      url: z.string().optional(),
      contact: z
        .object({
          email: z.string().optional(),
          name: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
})

export type InstallIntegrationRequest = z.infer<
  typeof installIntegrationRequestSchema
>

export const updateInstallationRequestSchema = z.object({
  billingPlanId: z.string(),
})

export const installationResponseSchema = z.object({
  billingPlan: billingPlanSchema.optional(),
  notification: notificationSchema.optional(),
})

export type InstallationResponse = z.infer<typeof installationResponseSchema>

export const getBillingPlansResponseSchema = z.object({
  plans: z.array(billingPlanSchema),
})

export type GetBillingPlansResponse = z.infer<
  typeof getBillingPlansResponseSchema
>

export const resourceSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  billingPlan: billingPlanSchema,
  name: z.string().min(1),
  metadata: metadataSchema,
  status: resourceStatusSchema,
  notification: notificationSchema.optional(),
})

export type Resource = z.infer<typeof resourceSchema>

export const provisionResourceRequestSchema = resourceSchema
  .pick({
    productId: true,
    name: true,
    metadata: true,
  })
  .extend({
    billingPlanId: z.string().min(1),
  })

export type ProvisionResourceRequest = z.infer<
  typeof provisionResourceRequestSchema
>

export const provisionResourceResponseSchema = resourceSchema.extend({
  secrets: resourceSecretsSchema,
})

export type ProvisionResourceResponse = z.infer<
  typeof provisionResourceResponseSchema
>

export const updateResourceRequestSchema = resourceSchema
  .pick({
    name: true,
    metadata: true,
  })
  .extend({
    billingPlanId: z.string().min(1).optional(),
    status: resourceStatusSchema.optional(),
  })
  .partial()

export type UpdateResourceRequest = z.infer<typeof updateResourceRequestSchema>

export const listResourcesResponseSchema = z.object({
  resources: z.array(resourceSchema),
})

export type ListResourcesResponse = z.infer<typeof listResourcesResponseSchema>
