"use client";

import { Suspense } from "react";
import { DashboardLayout } from "@morechat/views/layout";
import { MorechatIcon } from "@morechat/ui/components/common/morechat-icon";
import { SearchCommand } from "@morechat/views/search";
import { FloatingChat } from "@morechat/views/chat/floating-chat";
import { StarPrompt } from "@morechat/views/star-prompt";
import { WebNotificationBridge } from "@/components/web-notification-bridge";
import { WorkspaceDocumentTitle } from "@/platform/workspace-document-title";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* useSearchParams requires a Suspense boundary in the app router. Sits
          outside DashboardLayout so the tab is named while the guard is still
          resolving the workspace. */}
      <Suspense fallback={null}>
        <WorkspaceDocumentTitle />
      </Suspense>
      <DashboardLayout
        loadingIndicator={<MorechatIcon mode="think" size={40} />}
        extra={
          <>
            <SearchCommand />
            <WebNotificationBridge />
            <FloatingChat />
            <StarPrompt />
          </>
        }
      >
        {children}
      </DashboardLayout>
    </>
  );
}
