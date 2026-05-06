export type SeoTenantScope = {
  userId: string;
};

const CLIENT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}[a-zA-Z0-9]$/;
export const DEFAULT_CLIENT_ID = "demo-client";

export function normalizeClientId(rawClientId: unknown) {
  const clientId = typeof rawClientId === "string" ? rawClientId.trim() : "";

  if (!clientId) {
    return DEFAULT_CLIENT_ID;
  }

  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw new Error("Client id must be 3-64 characters using letters, numbers, underscores, or hyphens.");
  }

  const allowedClientIds = (process.env.SEO_ALLOWED_CLIENT_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowedClientIds.length > 0 && !allowedClientIds.includes(clientId)) {
    throw new Error("Client id is not allowed by this deployment.");
  }

  return clientId;
}

export function getTenantScopeFromRequest(request: Request): SeoTenantScope {
  return {
    userId: normalizeClientId(request.headers.get("x-seo-client-id")),
  };
}
