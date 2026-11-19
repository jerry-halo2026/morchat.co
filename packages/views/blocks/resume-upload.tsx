"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { api } from "@morechat/core/api";
import { useUpdateHrCandidate } from "@morechat/core/hr/mutations";
import { hrCandidateListOptions } from "@morechat/core/hr/queries";
import { useT } from "../i18n";
import { normalizeLabel } from "./import";

/** The file types a résumé arrives as: PDF, Word, and a phone snapshot of one. */
const ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg";

/** The two fields of a candidate this dialog needs: the name to match on, and
 *  the id to write `resume_attachment_id` against. */
export interface ResumeCandidateRef {
  id: string;
  name: string;
}

/** What a file name could be resolved to. */
export type ResumeMatchState = "matched" | "ambiguous" | "unmatched";

export interface ResumeMatch {
  state: ResumeMatchState;
  /** `matched`: the one candidate. `ambiguous`: every candidate whose name is
   *  in the file name, for the row's picker. `unmatched`: none. */
  candidates: ResumeCandidateRef[];
}

/**
 * Which candidate a résumé file belongs to, from its name alone.
 *
 * The rule is containment, not equality: agencies send
 * `林伟-短视频剪辑-3年.pdf` and `林伟 简历.pdf`, so a candidate matches when the
 * normalized file name contains the normalized candidate name. Folding both
 * sides through `normalizeLabel` makes `Lin Wei` match `LinWei_简历.pdf` and
 * keeps full-width punctuation from breaking a Chinese name.
 *
 * Two candidates matching is `ambiguous` rather than a guess. The same display
 * name is common enough (two `王伟` applying to one posting), and attaching one
 * person's résumé to another person's row is not recoverable by looking at the
 * ledger afterwards — the row would simply show a file. The dialog asks instead.
 */
export function matchResumeFile(
  fileName: string,
  candidates: readonly ResumeCandidateRef[],
): ResumeMatch {
  const needle = normalizeLabel(fileName);
  if (!needle) return { state: "unmatched", candidates: [] };

  const hits = candidates.filter((candidate) => {
    const name = normalizeLabel(candidate.name);
    return name !== "" && needle.includes(name);
  });

  if (hits.length === 0) return { state: "unmatched", candidates: [] };
  if (hits.length === 1) return { state: "matched", candidates: hits };
  return { state: "ambiguous", candidates: hits };
}

/** One picked file, its match, and what the last run did with it. */
interface PickedFile {
  /** File names repeat across directories; the position keeps keys unique. */
  key: string;
  file: File;
  state: ResumeMatchState;
  /** The candidate the file will be written to, or `null` while the row is
   *  unmatched or still ambiguous. */
  candidateId: string | null;
  /** The server's reason, kept beside the row instead of stopping the batch. */
  failure: string | null;
}

interface UploadResult {
  ok: number;
  failed: number;
}

/**
 * Pick résumé files, match them to candidates by name, upload them, and store
 * the attachment on the candidate.
 *
 * The dialog owns no matching rules — `matchResumeFile` decides, so the rule can
 * be tested against file names alone. What stays here is state: the picked
 * files, the candidate a row was pointed at by hand, and the counts of the run.
 *
 * Writes are serial — one `POST /api/upload-file`, then one
 * `PATCH /api/workbench/hr/candidates/:id` with `resume_attachment_id` — because
 * the second call depends on the first and a batch of résumés is small. A
 * failure keeps its reason on the row and the batch continues: ten files with
 * one unreadable PDF should leave nine files attached, not roll back.
 *
 * A file that matches nobody is never uploaded. There is nowhere to put it: the
 * attachment table hangs off a candidate, and an orphan upload would be a row
 * nobody can find from the ledger. The dialog says so and asks for the import
 * instead.
 */
export function ResumeUpload({
  wsId,
  open,
  onOpenChange,
}: {
  wsId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useT("blocks");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // One dialog, one batch. A reopen starts empty: the files, the row picks and
  // the counts described a batch that has already been written, and the ledger
  // behind the dialog has refreshed since. Resetting while rendering rather
  // than in an effect keeps the reopened dialog from flashing the last batch.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFiles([]);
      setPending(false);
      setResult(null);
    }
  }

  const candidatesQuery = useQuery({
    ...hrCandidateListOptions(wsId),
    enabled: open && !!wsId,
  });
  const candidates = useMemo<ResumeCandidateRef[]>(
    () => (candidatesQuery.data?.candidates ?? []).map((row) => ({ id: row.id, name: row.name })),
    [candidatesQuery.data],
  );

  const updateCandidate = useUpdateHrCandidate();

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    // Clearing the value lets the same file be picked again after a mistake.
    event.target.value = "";
    if (picked.length === 0) return;
    setResult(null);
    setFiles((current) => [
      ...current,
      ...picked.map((file, index): PickedFile => {
        const match = matchResumeFile(file.name, candidates);
        return {
          key: `${current.length + index}:${file.name}`,
          file,
          state: match.state,
          candidateId: match.state === "matched" ? (match.candidates[0]?.id ?? null) : null,
          failure: null,
        };
      }),
    ]);
  };

  const point = (key: string, candidateId: string) => {
    setFiles((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, candidateId } : entry)),
    );
  };

  const ready = files.filter((entry) => entry.candidateId !== null && entry.failure === null);
  const unmatched = files.filter((entry) => entry.state === "unmatched").length;

  const runUpload = async () => {
    if (pending || ready.length === 0) return;
    setPending(true);
    let ok = 0;
    let failed = 0;
    for (const entry of ready) {
      const candidateId = entry.candidateId;
      if (!candidateId) continue;
      try {
        const attachment = await api.uploadFile(entry.file);
        await updateCandidate.mutateAsync({
          id: candidateId,
          resume_attachment_id: attachment.id,
        });
        ok += 1;
      } catch (error) {
        failed += 1;
        const reason = error instanceof Error ? error.message : String(error);
        setFiles((current) =>
          current.map((row) => (row.key === entry.key ? { ...row, failure: reason } : row)),
        );
      }
    }
    setResult({ ok, failed });
    setPending(false);
  };

  /** What the row's last word is: the failure's own reason, or why the row is
   *  not writable yet. Kept as a kind so the label stays in the bundle. */
  const statusOf = (
    entry: PickedFile,
  ): { kind: "failed" | "unmatched" | "ambiguous" | "matched"; reason: string | null } => {
    if (entry.failure !== null) return { kind: "failed", reason: entry.failure };
    if (entry.state === "unmatched") return { kind: "unmatched", reason: null };
    if (entry.candidateId === null) return { kind: "ambiguous", reason: null };
    return { kind: "matched", reason: null };
  };

  const candidateItems = candidates.map((candidate) => ({
    value: candidate.id,
    label: candidate.name,
  }));

  const summary = result
    ? t(($) => $.resume.done, { count: result.ok, failed: result.failed })
    : t(($) => $.resume.summary, { count: files.length, ok: ready.length, unmatched });

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(($) => $.resume.title)}</DialogTitle>
          <DialogDescription>{t(($) => $.resume.hint)}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-1">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={pending || result !== null || candidates.length === 0}
            >
              {t(($) => $.resume.pick)}
            </Button>
            {candidates.length === 0 ? (
              <p className="text-caption text-muted-foreground">
                {t(($) => $.resume.no_candidates)}
              </p>
            ) : null}
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={pick}
          />

          {files.length > 0 ? (
            <section aria-label={t(($) => $.resume.title)} className="min-h-0">
              <div className="max-h-72 overflow-auto rounded-md border border-border">
                <table className="w-full text-caption">
                  <thead className="sticky top-0 bg-muted text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 text-start font-normal">
                        {t(($) => $.resume.column.file)}
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-start font-normal">
                        {t(($) => $.resume.column.size)}
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-start font-normal">
                        {t(($) => $.resume.column.candidate)}
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-start font-normal">
                        {t(($) => $.resume.column.status)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((entry) => {
                      const status = statusOf(entry);
                      return (
                        <tr key={entry.key}>
                          <td className="px-2 py-1">
                            <span className="block max-w-56 truncate" title={entry.file.name}>
                              {entry.file.name}
                            </span>
                          </td>
                          <td className="px-2 py-1 tabular-nums text-muted-foreground">
                            {formatSize(entry.file.size)}
                          </td>
                          <td className="px-2 py-1">
                            {entry.state === "unmatched" ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <Select
                                items={candidateItems}
                                value={entry.candidateId}
                                disabled={pending || result !== null}
                                onValueChange={(next) => {
                                  if (typeof next !== "string") return;
                                  point(entry.key, next);
                                }}
                              >
                                <SelectTrigger
                                  aria-label={t(($) => $.resume.column.candidate)}
                                  className="h-7 w-full min-w-0"
                                >
                                  <SelectValue>
                                    {() =>
                                      candidates.find((row) => row.id === entry.candidateId)?.name ??
                                      t(($) => $.resume.ambiguous)
                                    }
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {candidateItems.map((item) => (
                                    <SelectItem key={item.value} value={item.value}>
                                      {item.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td
                            className={
                              status.kind === "matched" || status.kind === "ambiguous"
                                ? "px-2 py-1 text-muted-foreground"
                                : "px-2 py-1 text-destructive"
                            }
                          >
                            <span className="block">{t(($) => $.resume[status.kind])}</span>
                            {status.reason === null ? null : (
                              <span className="block max-w-56 truncate" title={status.reason}>
                                {status.reason}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-caption text-muted-foreground" aria-live="polite">
            {summary}
          </p>
          <Button
            type="button"
            onClick={() => void runUpload()}
            disabled={pending || ready.length === 0 || result !== null}
            aria-busy={pending}
          >
            {pending ? <Spinner className="size-3.5" /> : null}
            {pending ? t(($) => $.resume.uploading) : t(($) => $.resume.upload)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** File size as the shortest unit that keeps it readable. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${Math.round(kilobytes)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
