import { api } from "../api";

export function resolvePublicFileUrlWithBase(rawUrl: string | null | undefined, baseUrl: string): string | null {
  if (!rawUrl) return null;
  if (!rawUrl.startsWith("/")) return rawUrl;
  const trimmedBaseUrl = baseUrl.replace(/\/+$/, "");
  return `${trimmedBaseUrl}${rawUrl}`;
}

export function resolvePublicFileUrl(rawUrl: string | null | undefined): string | null {
  // Only a root-relative path needs the API origin. Asking for the base URL
  // when there is nothing to join (an absolute URL, or no avatar at all) reads
  // platform state that may not be initialized — a workspace screen with no
  // logo is the common case, and it must not depend on the API being up.
  if (!rawUrl || !rawUrl.startsWith("/")) return rawUrl ?? null;
  return resolvePublicFileUrlWithBase(rawUrl, api.getBaseUrl());
}
