"use client";

/**
 * The chip an issue's `@` picker inserts for a knowledge page.
 *
 * The revision is part of the chip's identity (`space/path#v3`), so an issue
 * that cites a decision keeps citing the paragraph it was written against even
 * after the page moves on — the chip links to the page and shows the revision
 * it was pinned to.
 */

import { FileText } from "@morechat/ui/icons";
import { Badge } from "@morechat/ui/components/ui/badge";
import { useWorkspacePaths } from "@morechat/core/paths";
import { AppLink } from "../../navigation";
import { useT } from "../../i18n";
import { parseKnowledgeMentionRef } from "../hooks/use-knowledge";

export function KnowledgeMentionCard({
  ref: refId,
  fallbackLabel,
}: {
  /** `space/path#v<revision>`, as written into the mention node's id. */
  ref: string;
  fallbackLabel?: string;
}) {
  const { t } = useT("knowledge");
  const p = useWorkspacePaths();
  const parsed = parseKnowledgeMentionRef(refId);
  const label = fallbackLabel ?? (parsed ? parsed.path.split("/").pop() ?? parsed.path : refId);
  // The pinned revision is part of the chip's meaning even when the ref has no
  // page address (a retrieval hit cites an item, not a path), so it is read off
  // the `#vN` suffix in both branches.
  const pinned = parsed ? parsed.revision : Number.parseInt(refId.split("#v")[1] ?? "", 10) || 0;
  const versionBadge =
    pinned > 0 ? (
      <Badge variant="outline" className="h-4 px-1 text-micro">
        {t(($) => $.mention.chip_version, { n: pinned })}
      </Badge>
    ) : null;

  if (!parsed) {
    return (
      <span className="inline-flex max-w-64 items-center gap-1 rounded-md border border-surface-border px-1.5 py-0.5 align-middle text-caption">
        <FileText className="size-3 shrink-0 text-faint-foreground" aria-hidden />
        <span className="min-w-0 truncate">{label}</span>
        {versionBadge}
      </span>
    );
  }

  return (
    <AppLink
      href={p.knowledgePage(parsed.space, parsed.path)}
      className="inline-flex max-w-64 items-center gap-1 rounded-md border border-surface-border bg-surface-hover px-1.5 py-0.5 align-middle text-caption no-underline hover:bg-surface-selected"
    >
      <FileText className="size-3 shrink-0 text-faint-foreground" aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
      {versionBadge}
    </AppLink>
  );
}
