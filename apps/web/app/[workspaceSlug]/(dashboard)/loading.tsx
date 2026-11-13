"use client";

import { useParams } from "next/navigation";

import { WorkspaceFaceLoader } from "@morechat/views/common/workspace-face-loader";

// A `loading.tsx` renders as a fallback while the segment resolves, so its `params`
// is not guaranteed - reading it server-side threw
// "Cannot destructure property 'workspaceSlug' of undefined" on every navigation.
// The slug comes from the router instead, which is also where the rest of the shell
// reads it.
export default function WorkspaceLoading() {
  const params = useParams<{ workspaceSlug?: string }>();
  return <WorkspaceFaceLoader workspaceId={params?.workspaceSlug} />;
}
