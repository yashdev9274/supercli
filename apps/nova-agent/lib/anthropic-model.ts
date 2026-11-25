import { createScopedProviderModel } from "./scoped-provider-model"

export function createAnthropicModel(input: Parameters<typeof createScopedProviderModel>[0]) {
  if (input.scope.provider !== "anthropic") throw new Error("This integration has no Anthropic-native Eve adapter")
  return createScopedProviderModel(input)
}
