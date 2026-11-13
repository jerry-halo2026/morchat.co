import { WorkspaceFaceLoader } from "@morechat/views/common/workspace-face-loader";

// Route transitions inside a workspace show the workspace's own face rather than a
// blank frame. The slug is enough to pick it: the same id derives the same character
// everywhere else in the app.
export default async function WorkspaceLoading({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <WorkspaceFaceLoader workspaceId={workspaceSlug} />;
}
