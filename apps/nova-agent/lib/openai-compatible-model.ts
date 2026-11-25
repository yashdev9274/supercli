import { isOpenAICompatibleIntegration } from "@super/agent-runtime/integrations"
import { createScopedProviderModel } from "./scoped-provider-model"

export function createOpenAICompatibleModel(input: Parameters<typeof createScopedProviderModel>[0]) {
  if (!isOpenAICompatibleIntegration(input.scope.provider)) throw new Error("This integration has no OpenAI-compatible Eve adapter")
  return createScopedProviderModel(input)
}
