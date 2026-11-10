export interface SupabasePasswordConfig {
  enabled: boolean;
  url?: string;
  publishable_key?: string;
}

// No Supabase SDK session persistence/auto-refresh: credentials and provider
// proof remain transient, and only our bounded native session survives login.
export async function signInWithSupabasePassword(
  config: SupabasePasswordConfig, email: string, password: string,
): Promise<string> {
  if (!config.enabled || config.url !== "https://qcpgqehqjescuwqhnmie.supabase.co" ||
      !config.publishable_key?.startsWith("sb_publishable_")) {
    throw new Error("Password sign-in is not configured");
  }
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST", credentials: "omit", cache: "no-store", redirect: "error",
    headers: { "Content-Type": "application/json", apikey: config.publishable_key },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!response.ok) throw new Error("Sign-in failed. Check your email and password.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("access_token" in data) ||
      typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("Sign-in failed. Please try again.");
  }
  return data.access_token;
}
