type Schema = Record<string, unknown>

/** The canonical tools use this bounded JSON-schema subset. Unsupported constraints fail closed. */
export function validateArguments(schema: Schema, value: unknown, path = "args"): unknown {
  if (value === undefined && "default" in schema) return structuredClone(schema.default)
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) throw new Error(`${path}: unsupported value`)
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected object`)
    const input = value as Record<string, unknown>
    const properties = (schema.properties ?? {}) as Record<string, Schema>
    const required = (schema.required ?? []) as string[]
    const result: Record<string, unknown> = {}
    for (const key of required) if (input[key] === undefined) throw new Error(`${path}.${key}: required`)
    for (const [key, child] of Object.entries(properties)) {
      if (input[key] !== undefined || "default" in child) result[key] = validateArguments(child, input[key], `${path}.${key}`)
    }
    if (schema.additionalProperties === false && Object.keys(input).some((key) => !(key in properties))) throw new Error(`${path}: unknown property`)
    return schema.additionalProperties === false ? result : { ...input, ...result }
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) throw new Error(`${path}: expected array`)
    if (value.length > Number(schema.maxItems ?? 1000) || value.length < Number(schema.minItems ?? 0)) throw new Error(`${path}: invalid item count`)
    return value.map((item, i) => validateArguments((schema.items ?? {}) as Schema, item, `${path}[${i}]`))
  }
  if (schema.type === "string") {
    if (typeof value !== "string" || value.length < Number(schema.minLength ?? 0) || value.length > Number(schema.maxLength ?? 1_000_000)) throw new Error(`${path}: invalid string`)
  }
  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value)) || value < Number(schema.minimum ?? -Infinity) || value > Number(schema.maximum ?? Infinity)) throw new Error(`${path}: invalid number`)
  }
  if (schema.type === "boolean" && typeof value !== "boolean") throw new Error(`${path}: expected boolean`)
  return value
}
