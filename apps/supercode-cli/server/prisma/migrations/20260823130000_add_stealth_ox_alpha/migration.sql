-- Ensure free open model stealth/ox-alpha exists for Spark (Grandfathered) users.
-- Safe to re-run: upserts by unique slug.
INSERT INTO "model" (
  "id",
  "slug",
  "displayName",
  "provider",
  "minTier",
  "inputPrice",
  "outputPrice",
  "cachedPrice",
  "active",
  "createdAt",
  "updatedAt"
) VALUES (
  'model_stealth_ox_alpha',
  'stealth/ox-alpha',
  'OX Alpha',
  'supercode',
  'spark',
  0,
  0,
  0,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "provider" = EXCLUDED."provider",
  "minTier" = 'spark',
  "inputPrice" = EXCLUDED."inputPrice",
  "outputPrice" = EXCLUDED."outputPrice",
  "cachedPrice" = EXCLUDED."cachedPrice",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
