"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy } from "@morechat/ui/icons";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { copyText } from "@morechat/ui/lib/clipboard";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../../i18n";
import type { RuntimeOfflineGuidance } from "./runtime-offline-guidance";

const COPIED_FEEDBACK_MS = 1_500;

/**
 * Readable replacement for a raw daemon reason: what is wrong, what to do about
 * it, and one command the user can copy. Rendered on the runtime page only
 * while a state we can explain is present — an unrecognised reason keeps the
 * page's existing offline status, which is where the daemon's detail still
 * belongs.
 */
export function RuntimeOfflineGuidanceCard({
  guidance,
}: {
  guidance: RuntimeOfflineGuidance;
}) {
  const { t } = useT("runtimes");
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = async () => {
    if (!(await copyText(guidance.command))) return;
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  };

  const profileMissing = guidance.kind === "dsh_profile_missing";
  const title = t(($) =>
    profileMissing
      ? $.offline_guidance.dsh_profile_missing.title
      : $.offline_guidance.dsh_login.title,
  );
  const body = t(($) =>
    profileMissing
      ? $.offline_guidance.dsh_profile_missing.body
      : $.offline_guidance.dsh_login.body,
  );
  const commandLabel = t(($) =>
    profileMissing
      ? $.offline_guidance.dsh_profile_missing.command_label
      : $.offline_guidance.dsh_login.command_label,
  );

  return (
    <section
      aria-label={title}
      data-guidance={guidance.kind}
      className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="text-body font-medium">{title}</h2>
          <p className="text-caption leading-5 text-muted-foreground">{body}</p>

          <div className="flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-xs bg-muted px-2 py-1 font-mono text-caption">
              {guidance.command}
            </code>
            <IconButton
              size="icon-sm"
              variant="outline"
              className="shrink-0"
              onClick={handleCopy}
              label={copied ? t(($) => $.offline_guidance.copied) : commandLabel}
            >
              {copied ? (
                <Check className={cn("size-3.5 text-success")} />
              ) : (
                <Copy className={cn("size-3.5 text-muted-foreground")} />
              )}
            </IconButton>
          </div>

          {profileMissing && (
            <p className="text-caption leading-5 text-muted-foreground">
              {t(($) => $.offline_guidance.dsh_profile_missing.bundle_hint)}
            </p>
          )}

          {guidance.detail && (
            <p className="text-micro leading-4 text-faint-foreground">
              {t(($) => $.offline_guidance.detail_label, { detail: guidance.detail })}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
