const OFFICIAL_MARKETING_HOSTS = new Set(["morechat.co", "www.morechat.co"]);

export function isOfficialMarketingHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  return OFFICIAL_MARKETING_HOSTS.has(normalized);
}
