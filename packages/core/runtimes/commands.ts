export const CLOUD_SERVER_URL = "https://api.morechat.co";
export const CLOUD_APP_URL = "https://morechat.co";

export function normalizeCommandURL(url: string | undefined): string {
  return url?.trim().replace(/\/+$/, "") ?? "";
}

export type DaemonSetupTarget = "cloud" | "self_host" | "unknown";
export type DaemonConfigStatus = "loading" | "ready" | "error";

export interface DaemonSetupConfig {
  status: DaemonConfigStatus;
  target: DaemonSetupTarget;
  serverUrl?: string;
  appUrl?: string;
}

export type DaemonCommands =
  | { status: "ready"; setupCmd: string; tokenCmd: string }
  | { status: "loading" | "error" | "unknown" | "incomplete" };

export function daemonCommands(config: DaemonSetupConfig): DaemonCommands {
  if (config.status !== "ready") return { status: config.status };

  if (config.target === "self_host") {
    const normalizedServerUrl = normalizeCommandURL(config.serverUrl);
    const normalizedAppUrl = normalizeCommandURL(config.appUrl);
    if (!normalizedServerUrl || !normalizedAppUrl) return { status: "incomplete" };
    return {
      status: "ready",
      setupCmd: `morechat setup self-host --server-url ${normalizedServerUrl} --app-url ${normalizedAppUrl}`,
      tokenCmd: `morechat config set server_url ${normalizedServerUrl}
morechat config set app_url ${normalizedAppUrl}
morechat login --token <YOUR_TOKEN>
morechat daemon start`,
    };
  }

  // Empty URLs are also returned by misconfigured self-hosted servers.
  if (config.target !== "cloud") return { status: "unknown" };
  return {
    status: "ready",
    setupCmd: "morechat setup",
    tokenCmd: `morechat config set server_url ${CLOUD_SERVER_URL}
morechat config set app_url ${CLOUD_APP_URL}
morechat login --token <YOUR_TOKEN>
morechat daemon start`,
  };
}
