"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@morechat/core/api";
import { useWorkspacePaths } from "@morechat/core/paths";
import type { HrCandidate } from "@morechat/core/types";
import { useLocale, useT } from "../../i18n";
import { AppLink } from "../../navigation";
import { useResumesCopy } from "./resumes-copy";
import { formatSalary } from "./resumes-model";

/**
 * The right column: one candidate's résumé as it is stored.
 *
 * The markup is `CandidateSheet`'s résumé tab, not a second way to draw the same
 * row — the attachment is a link to the attachment preview route (the preview is
 * a page of its own everywhere in the app), and the body is `resume_text` as one
 * blob in `whitespace-pre-wrap`, because there is no structured résumé to fold
 * into sections (the sheet's own note on this stands). The two differences are
 * what the surrounding layout already decides: this surface never collapses the
 * body — the column scrolls, so a long résumé has room — and it carries the row's
 * identifying line above the text, which the sheet puts in its header instead.
 *
 * `CandidateSheet` keeps its three helpers private to that file, so this is a
 * copy rather than an import. If the presentation changes, both move together.
 */
export function ResumePreview({
  candidate,
  jobTitle,
}: {
  candidate: HrCandidate;
  jobTitle: string | null;
}) {
  const { t } = useT("layout");
  const { t: tBlocks } = useT("blocks");
  const copy = useResumesCopy();
  const locales = useLocale();

  // The row's identifying line: what the reader needs to keep in mind while
  // reading the text, and nothing the list beside it already repeats per row.
  const meta = [
    candidate.source,
    candidate.edu,
    candidate.years_experience === null
      ? null
      : copy("years", { count: candidate.years_experience }),
    formatSalary(candidate, locales),
  ].filter((part): part is string => !!part);

  return (
    <div data-slot="resume-preview" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-surface-border px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="min-w-0 truncate text-title-sm font-semibold" title={candidate.name}>
            {candidate.name}
          </h2>
          <p className="min-w-0 truncate text-caption text-muted-foreground">
            {[jobTitle, ...meta].filter((part): part is string => !!part).join(" · ")}
          </p>
        </div>
        <span className="shrink-0 rounded-sm bg-surface-hover px-1.5 py-0.5 text-caption text-muted-foreground">
          {tBlocks(($) => $.ledger.candidate_stage[candidate.stage])}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {candidate.resume_attachment_id ? (
          <ResumeAttachment attachmentId={candidate.resume_attachment_id} />
        ) : null}
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-surface-border p-3">
          <span className="min-w-0 truncate text-label font-medium">
            {tBlocks(($) => $.record.field.resume_text)}
          </span>
          {candidate.resume_text ? (
            <p className="whitespace-pre-wrap break-words text-label">{candidate.resume_text}</p>
          ) : (
            <p className="text-label text-muted-foreground">
              {t(($) => $.hr.recruit.resume_empty)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** The attached file's name, and the way in to its preview. */
function ResumeAttachment({ attachmentId }: { attachmentId: string }) {
  const { t } = useT("editor");
  const paths = useWorkspacePaths();
  const query = useQuery({
    queryKey: ["hr-resumes-attachment", attachmentId] as const,
    queryFn: () => api.getAttachment(attachmentId),
    staleTime: Infinity,
  });
  const filename = query.data?.filename || attachmentId.slice(0, 8);

  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-surface-border px-2.5 py-1.5">
      <span className="min-w-0 truncate text-label" title={filename}>
        {filename}
      </span>
      <AppLink
        href={paths.attachmentPreview(attachmentId)}
        className="shrink-0 text-caption text-brand underline underline-offset-2"
      >
        {t(($) => $.attachment.preview)}
      </AppLink>
    </div>
  );
}
