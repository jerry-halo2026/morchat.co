import type { Metadata } from "next";
import { pageMetadata } from "@/features/landing/utils/page-metadata";
import { fetchLatestRelease } from "@/features/landing/utils/github-release";
import { getRequestPlatform } from "@/features/landing/utils/request-platform";
import { isDownloadKey } from "@/features/landing/utils/download-target";
import { DownloadClient } from "./download-client";

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("download", "/download");
}

// The page renders per request so its first paint names the visitor's
// platform. The version comes from apps/web/package.json (or
// NEXT_PUBLIC_APP_VERSION), so nothing here waits on a network call.
export default async function DownloadPage({
  searchParams,
}: {
  searchParams: Promise<{ started?: string | string[] }>;
}) {
  const [release, platform, params] = await Promise.all([fetchLatestRelease(), getRequestPlatform(), searchParams]);
  const started = isDownloadKey(params.started) ? params.started : null;
  return <DownloadClient release={release} platform={platform} started={started} />;
}
